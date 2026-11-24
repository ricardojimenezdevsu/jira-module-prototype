// Exercises the kitchen routes end to end over HTTP, with a fake token check and a fake Jira.
import { test, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import type { FetchIssue, LogEntry, Ticket, VerifyFit } from '../src/types.ts';

const APP_ID = 'ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000';

// The fake verifier accepts "good-<issueKey>" and returns claims shaped like a real FIT.
const verifyFit: VerifyFit = async (token) => {
  if (!token.startsWith('good-')) throw new Error('bad signature');
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
      moduleKey: 'send-to-kitchen',
      extension: { type: 'jira:issueAction', issue: { key: token.slice(5), id: '10001' } },
    },
    principal: 'account-1',
  };
};

const jiraCalls: Parameters<FetchIssue>[0][] = [];
const fetchIssue: FetchIssue = async (args) => {
  jiraCalls.push(args);
  return {
    fields: {
      summary: 'Mushroom risotto',
      status: { name: 'To Do' },
      priority: { name: 'High' },
      labels: ['vegetarian'],
      issuetype: { name: 'Task' },
    },
  };
};

const silent = { log() {}, warn() {}, error() {} };
let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp({ appId: APP_ID, verifyFit, fetchIssue, logger: silent }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

interface CallOptions {
  token?: string;
  userToken?: string;
  method?: string;
  body?: unknown;
}

const call = (path: string, { token, userToken, method = 'GET', body }: CallOptions = {}) =>
  fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(userToken ? { 'x-forge-oauth-user': userToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test('health check needs no token', async () => {
  assert.equal((await call('/health')).status, 200);
});

test('kitchen routes return 401 without a valid token', async () => {
  assert.equal((await call('/kitchen/ticket')).status, 401);
  assert.equal((await call('/kitchen/ticket', { token: 'forged' })).status, 401);
});

test('order flow: send, read ticket, advance, read log', async () => {
  const opts = { token: 'good-SP-10', userToken: 'user-token' };

  assert.deepEqual(await (await call('/kitchen/ticket', opts)).json(), { ticket: null });

  const sent = await call('/kitchen/orders', { ...opts, method: 'POST', body: { notes: 'No onions' } });
  assert.equal(sent.status, 201);
  const { ticket } = (await sent.json()) as { ticket: Ticket };
  assert.equal(ticket.dish, 'Mushroom risotto');
  assert.equal(ticket.issueKey, 'SP-10'); // from the token, not the body
  assert.equal(ticket.rush, true);
  assert.deepEqual(ticket.dietary, ['vegetarian']);
  assert.equal(ticket.notes, 'No onions');
  assert.deepEqual(jiraCalls.at(-1), {
    apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-1',
    userToken: 'user-token',
    issueKey: 'SP-10',
  });

  const advanced = (await (await call('/kitchen/ticket/advance', { ...opts, method: 'POST' })).json()) as {
    ticket: Ticket;
  };
  assert.equal(advanced.ticket.stageIndex, 1);

  const { entries } = (await (await call('/kitchen/log', opts)).json()) as { entries: LogEntry[] };
  assert.equal(entries.length, 2);
  assert.match(entries[0].text, /Cooking/); // newest first
  assert.equal(entries[1].accountId, 'account-1');
});

test('issues are isolated: another issue has no ticket', async () => {
  const res = await call('/kitchen/ticket', { token: 'good-SP-11' });
  assert.deepEqual(await res.json(), { ticket: null });
});

test('sending an order without the user token is refused (not 401)', async () => {
  const res = await call('/kitchen/orders', { token: 'good-SP-12', method: 'POST', body: {} });
  assert.equal(res.status, 403);
});

test('advancing past Served returns 409', async () => {
  const opts = { token: 'good-SP-13', userToken: 'user-token' };
  await call('/kitchen/orders', { ...opts, method: 'POST', body: {} });
  for (let i = 0; i < 3; i++) await call('/kitchen/ticket/advance', { ...opts, method: 'POST' });
  const res = await call('/kitchen/ticket/advance', { ...opts, method: 'POST' });
  assert.equal(res.status, 409);
});
