// Exercises the connector routes over HTTP, with a fake token check, a fake Jira and the Velx stub.
import { beforeAll, afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { createJiraPropertyLinkStore } from '../src/linkStore.ts';
import type { ActivityEntry, FetchIssue, VerifyFit } from '../src/types.ts';
import { SEED_DATASOURCES } from '../src/velx/seed.ts';
import { StubVelxClient } from '../src/velx/stub.ts';
import type { Datasource, Initiative, InitiativeDetail } from '../src/velx/types.ts';

const APP_ID = 'ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000';
const AUDIT = '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e02'; // seed: "Add audit logging to the web portal", row 6
const ARCHIVED = '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e06';
const [PAYMENTS, PORTAL] = SEED_DATASOURCES.map((d) => d.datasourceId);

// The fake verifier accepts "good-<issueKey>" ("good-" alone means no issue) and returns
// claims shaped like a real FIT. The issue id is derived from the key.
const verifyFit: VerifyFit = async (token) => {
  if (!token.startsWith('good-')) throw new Error('bad signature');
  const key = token.slice(5);
  return {
    app: {
      id: APP_ID,
      installationId: 'ari:cloud:ecosystem::installation/test',
      apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-1',
      environment: { type: 'DEVELOPMENT' },
    },
    context: {
      cloudId: 'cloud-1',
      siteUrl: 'https://example.atlassian.net',
      moduleKey: 'velx-initiative-panel',
      extension: { type: 'jira:issuePanel', ...(key ? { issue: { key, id: `id-${key}` } } : {}) },
    },
    principal: 'account-1',
  };
};

const jiraCalls: Parameters<FetchIssue>[0][] = [];
const fetchIssue: FetchIssue = async (args) => {
  jiraCalls.push(args);
  return {
    fields: {
      summary: 'Speed up checkout',
      status: { name: 'To Do' },
      description: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checkout is ' }, { type: 'text', text: 'slow', marks: [{ type: 'strong' }] }] }],
      },
    },
  };
};

// Fake Jira issue properties, keyed by issue id.
const properties = new Map<string, unknown>();
const linkStore = createJiraPropertyLinkStore({
  getIssueProperty: async ({ issueIdOrKey }) => properties.get(issueIdOrKey) ?? null,
  setIssueProperty: async ({ issueIdOrKey, value }) => void properties.set(issueIdOrKey, value),
  deleteIssueProperty: async ({ issueIdOrKey }) => void properties.delete(issueIdOrKey),
  logger: { log() {}, warn() {}, error() {} },
});

const logLines: string[] = [];
const logger = { log: (line: string) => void logLines.push(line), warn() {}, error() {} };

const servers: Server[] = [];
const start = async (simulation = true) => {
  const server = createApp({
    appId: APP_ID,
    verifyFit,
    fetchIssue,
    linkStore,
    velx: new StubVelxClient(),
    velxWebUrl: 'https://demo.velx.example',
    velxUsername: 'demo.user',
    simulation,
    logger,
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(server);
  return `http://localhost:${(server.address() as AddressInfo).port}`;
};

let base: string;
beforeAll(async () => {
  base = await start();
});
afterAll(() => {
  for (const s of servers) s.close();
});

interface CallOptions {
  token?: string;
  userToken?: string | null;
  method?: string;
  body?: unknown;
  at?: string;
}

/** Calls the connector as the user on issue `token`'s key. Sends a user token unless null. */
const call = (path: string, { token, userToken = 'user-token', method = 'GET', body, at = base }: CallOptions = {}) =>
  fetch(at + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(token && userToken ? { 'x-forge-oauth-user': userToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

interface LinkBody {
  link: { initiativeId: string; linkedAt: string } | null;
  initiative: InitiativeDetail | null;
  velxUrl: string | null;
  problem?: string;
}

test('health check needs no token', async () => {
  assert.equal((await call('/health')).status, 200);
});

test('connector routes return 401 without a valid token', async () => {
  assert.equal((await call('/jira/link')).status, 401);
  assert.equal((await call('/velx/initiatives')).status, 401);
  assert.equal((await call('/jira/link', { token: 'forged' })).status, 401);
});

test('calls that do not come from an issue are refused', async () => {
  assert.equal((await call('/jira/link', { token: 'good-' })).status, 400);
});

test('calls that need Jira without the user token get 403, not 401', async () => {
  assert.equal((await call('/jira/link', { token: 'good-SP-1', userToken: null })).status, 403);
  assert.equal((await call('/jira/draft', { token: 'good-SP-1', userToken: null })).status, 403);
});

test('Velx lists hide archived initiatives and use resource ids', async () => {
  const { data } = await json<{ data: Initiative[] }>(call('/velx/initiatives', { token: 'good-SP-1' }));
  assert.ok(data.length > 0);
  assert.ok(!data.some((i) => i.initiativeId === ARCHIVED));
  const { data: repos } = await json<{ data: Datasource[] }>(call('/velx/datasources', { token: 'good-SP-1' }));
  assert.ok(repos.every((r) => r.datasourceId.startsWith('resource:')));
});

test('draft comes from the issue, read as the user', async () => {
  const draft = await json<{ title: string; initiativeGoal: string }>(call('/jira/draft', { token: 'good-SP-2' }));
  assert.equal(draft.title, 'Speed up checkout');
  assert.equal(draft.initiativeGoal, 'Checkout is **slow**\n\n---\nSource: Jira issue SP-2 (https://example.atlassian.net/browse/SP-2)');
  assert.deepEqual(jiraCalls.at(-1), {
    apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-1',
    userToken: 'user-token',
    issueKey: 'SP-2',
  });
});

test('link flow: none, link, read, journal, unlink', async () => {
  const opts = { token: 'good-SP-3' };
  assert.deepEqual(await json(call('/jira/link', opts)), { link: null, initiative: null, velxUrl: null });

  // The issue in the body is ignored: the token decides which issue is linked.
  const linked = await json<LinkBody>(
    call('/jira/link', { ...opts, method: 'PUT', body: { initiativeId: AUDIT, issueKey: 'OTHER-1' } })
  );
  assert.equal(linked.initiative?.title, 'Add audit logging to the web portal');
  assert.equal(linked.velxUrl, `https://demo.velx.example/initiatives/${AUDIT}`);
  assert.deepEqual(properties.get('id-SP-3'), { v: 1, initiativeId: AUDIT, linkedAt: linked.link?.linkedAt });
  assert.equal(properties.has('id-OTHER-1'), false);

  const read = await json<LinkBody>(call('/jira/link', opts));
  assert.equal(read.initiative?.currentStep, 'implementation-plan');
  assert.equal(read.initiative?.currentStepStatus, 'waiting_for_approval');

  const { entries } = await json<{ entries: ActivityEntry[] }>(call('/jira/journal', opts));
  assert.equal(entries[0].source, 'jira'); // newest first: the link event
  assert.match(entries[0].text, /Linked to "Add audit logging/);
  assert.ok(entries.some((e) => e.source === 'agent' && e.tag === 'plan-revision'));

  assert.deepEqual(await json(call('/jira/link', { ...opts, method: 'DELETE' })), { link: null });
  assert.equal(properties.has('id-SP-3'), false);
  const after = await json<{ entries: ActivityEntry[] }>(call('/jira/journal', opts));
  assert.match(after.entries[0].text, /Unlinked/);
});

test('links are kept per issue', async () => {
  await call('/jira/link', { token: 'good-SP-4', method: 'PUT', body: { initiativeId: AUDIT } });
  assert.equal((await json<LinkBody>(call('/jira/link', { token: 'good-SP-5' }))).link, null);
});

test('linking validates the initiative id', async () => {
  const opts = { token: 'good-SP-6', method: 'PUT' };
  assert.equal((await call('/jira/link', { ...opts, body: { initiativeId: 'x' } })).status, 400);
  assert.equal((await call('/jira/link', { ...opts, body: { initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4eff' } })).status, 404);
  assert.equal((await call('/jira/link', { ...opts, body: { initiativeId: ARCHIVED } })).status, 409);
});

test('a property pointing nowhere, or edited by hand, does not break the modules', async () => {
  properties.set('id-SP-7', { v: 1, initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4eff', linkedAt: 'x' });
  const missing = await json<LinkBody>(call('/jira/link', { token: 'good-SP-7' }));
  assert.equal(missing.initiative, null);
  assert.equal(missing.problem, 'not-found');
  assert.equal((await call('/jira/journal', { token: 'good-SP-7' })).status, 200);

  properties.set('id-SP-8', { initiativeId: '../../admin' });
  const invalid = await json<LinkBody>(call('/jira/link', { token: 'good-SP-8' }));
  assert.equal(invalid.problem, 'invalid-link');
});

test('create validates the body like Velx', async () => {
  const opts = { token: 'good-SP-9', method: 'POST' };
  assert.equal((await call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: [] } })).status, 400);
  assert.equal((await call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: ['resource:nope'] } })).status, 400);
  assert.equal((await call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: 'x' } })).status, 400);
  assert.equal(
    (await call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: [PORTAL], title: 'x'.repeat(201) } })).status,
    400
  );
  assert.equal(properties.has('id-SP-9'), false);
});

test('create from the issue, then simulate progress and failure', async () => {
  const opts = { token: 'good-SP-10' };
  const res = await call('/jira/initiatives', {
    ...opts,
    method: 'POST',
    body: { targetDatasourceIds: [PORTAL], contextDatasourceIds: [PAYMENTS] },
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as LinkBody;
  const initiative = created.initiative as InitiativeDetail;
  assert.equal(initiative.title, 'Speed up checkout'); // from the issue
  assert.match(initiative.initiativeGoal, /Source: Jira issue SP-10/);
  assert.equal(initiative.status, 'In Planning');
  assert.equal(initiative.currentStep, 'as-is');
  assert.equal(initiative.currentStepStatus, 'thinking');
  assert.equal(initiative.planFormat, 'unified');
  assert.equal(initiative.createdByUsername, 'demo.user');
  assert.deepEqual((properties.get('id-SP-10') as { initiativeId: string }).initiativeId, initiative.initiativeId);

  const { initiatives } = { initiatives: (await json<{ data: Initiative[] }>(call('/velx/initiatives', opts))).data };
  assert.ok(initiatives.some((i) => i.initiativeId === initiative.initiativeId));

  const advance = () => call('/jira/simulate/advance', { ...opts, method: 'POST' });
  const failed = await json<{ initiative: InitiativeDetail }>(call('/jira/simulate/fail', { ...opts, method: 'POST' }));
  assert.equal(failed.initiative.currentStepStatus, 'failed');
  const retried = await json<{ initiative: InitiativeDetail }>(advance());
  assert.equal(retried.initiative.currentStepStatus, 'thinking');

  let last: Response | undefined;
  for (let i = 0; i < 9; i++) last = await advance();
  assert.equal((await json<{ initiative: InitiativeDetail }>(last as Response)).initiative.status, 'Implemented');
  assert.equal((await advance()).status, 409);

  const { entries } = await json<{ entries: ActivityEntry[] }>(call('/jira/journal', opts));
  assert.ok(entries.length > 10);
  assert.ok(entries.some((e) => e.source === 'jira' && /Created "Speed up checkout"/.test(e.text)));
});

test('create on a linked issue needs replaceLink', async () => {
  const opts = { token: 'good-SP-11', method: 'POST' };
  await call('/jira/link', { token: 'good-SP-11', method: 'PUT', body: { initiativeId: AUDIT } });
  const refused = await call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: [PORTAL] } });
  assert.equal(refused.status, 409);
  assert.equal(((await refused.json()) as { code: string }).code, 'already-linked');

  const replaced = await json<LinkBody>(
    call('/jira/initiatives', { ...opts, body: { targetDatasourceIds: [PORTAL], replaceLink: true } })
  );
  assert.notEqual(replaced.initiative?.initiativeId, AUDIT);
  assert.equal((properties.get('id-SP-11') as { initiativeId: string }).initiativeId, replaced.initiative?.initiativeId);
});

test('simulation routes 404 when the issue is not linked or simulation is off', async () => {
  assert.equal((await call('/jira/simulate/advance', { token: 'good-SP-12', method: 'POST' })).status, 404);
  const off = await start(false);
  await call('/jira/link', { token: 'good-SP-13', method: 'PUT', body: { initiativeId: AUDIT }, at: off });
  assert.equal((await call('/jira/simulate/advance', { token: 'good-SP-13', method: 'POST', at: off })).status, 404);
});

test('the tenant mapping a real connector needs is logged once per site and user', async () => {
  const siteLines = logLines.filter((l) => l.startsWith('[tenant] cloudId=cloud-1'));
  const userLines = logLines.filter((l) => l.startsWith('[tenant] accountId=account-1'));
  // One per app instance: the main one and the simulation-off one.
  assert.equal(siteLines.length, 2);
  assert.equal(userLines.length, 2);
  assert.ok(logLines.some((l) => l.startsWith('[forge]') && l.includes('velxUser=demo.user')));
  assert.ok(!logLines.some((l) => l.includes('user-token')), 'tokens are never logged');
});
