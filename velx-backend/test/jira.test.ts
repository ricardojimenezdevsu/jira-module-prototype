// Jira REST helpers (with a fake fetch) and the link stores.
import { afterEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/errors.ts';
import { deleteIssueProperty, fetchIssue, getIssueProperty, setIssueProperty } from '../src/jira.ts';
import { createJiraPropertyLinkStore, createMemoryLinkStore, INVALID_LINK, parseLink } from '../src/linkStore.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url: string;
  method: string;
  auth: string | null;
  body?: string;
}

/** Replaces fetch with one that records the request and answers with `status` and `json`. */
const fakeFetch = (status: number, json?: unknown) => {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(input), method: init?.method ?? 'GET', auth: headers.get('authorization'), body: init?.body as string | undefined });
    return new Response(json === undefined ? null : JSON.stringify(json), { status });
  }) as typeof fetch;
  return seen;
};

const base = { apiBaseUrl: 'https://api.example/ex/jira/c1', userToken: 'tok' };
const prop = { ...base, issueIdOrKey: '10001', propertyKey: 'velx-initiative' };
const hasStatus = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;

test('fetchIssue asks for the description and sends the user token', async () => {
  const seen = fakeFetch(200, { fields: { summary: 'S' } });
  await fetchIssue({ ...base, issueKey: 'SP-1' });
  assert.match(seen[0].url, /\/rest\/api\/3\/issue\/SP-1\?fields=.*description/);
  assert.equal(seen[0].auth, 'Bearer tok');
});

test('a missing property reads as null', async () => {
  fakeFetch(404, { errorMessages: ['nope'] });
  assert.equal(await getIssueProperty(prop), null);
});

test('reading a property returns its value', async () => {
  const seen = fakeFetch(200, { key: 'velx-initiative', value: { v: 1 } });
  assert.deepEqual(await getIssueProperty(prop), { v: 1 });
  assert.equal(seen[0].url, 'https://api.example/ex/jira/c1/rest/api/3/issue/10001/properties/velx-initiative');
});

test('Jira 401 never reaches Forge as 401', async () => {
  fakeFetch(401);
  await assert.rejects(getIssueProperty(prop), hasStatus(502));
});

test('setting a property without edit permission is a 403', async () => {
  const seen = fakeFetch(403);
  await assert.rejects(setIssueProperty({ ...prop, value: { a: 1 } }), hasStatus(403));
  assert.equal(seen[0].method, 'PUT');
  assert.equal(seen[0].body, '{"a":1}');
});

test('deleting a property that is not there is fine', async () => {
  fakeFetch(404);
  await deleteIssueProperty(prop);
});

test('parseLink accepts only well-formed links', () => {
  const good = { v: 1, initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e01', linkedAt: '2026-11-25T00:00:00Z' };
  assert.deepEqual(parseLink(good), good);
  assert.equal(parseLink(null), null);
  assert.equal(parseLink('x'), INVALID_LINK);
  assert.equal(parseLink({ ...good, initiativeId: '../../admin' }), INVALID_LINK);
  assert.equal(parseLink({ ...good, v: 2 }), INVALID_LINK);
});

test('the Jira property store keys by issue id and validates what it reads', async () => {
  const calls: { issueIdOrKey: string; value?: unknown }[] = [];
  const store = createJiraPropertyLinkStore({
    getIssueProperty: async (a) => (calls.push(a), { v: 1, initiativeId: 'not-a-uuid', linkedAt: 'x' }),
    setIssueProperty: async (a) => void calls.push(a),
    deleteIssueProperty: async (a) => void calls.push(a),
    logger: { log() {}, warn() {}, error() {} },
  });
  const target = { ...base, cloudId: 'c1', issueId: '10001', issueKey: 'SP-1' };
  assert.equal(await store.get(target), INVALID_LINK);
  await store.set(target, { v: 1, initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e01', linkedAt: 'now' });
  assert.ok(calls.every((c) => c.issueIdOrKey === '10001'));
});

test('the memory store keeps links per site and issue', async () => {
  const store = createMemoryLinkStore();
  const a = { ...base, cloudId: 'c1', issueId: '1', issueKey: 'SP-1' };
  const link = { v: 1 as const, initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e01', linkedAt: 'now' };
  await store.set(a, link);
  assert.deepEqual(await store.get(a), link);
  assert.equal(await store.get({ ...a, cloudId: 'c2' }), null);
  await store.delete(a);
  assert.equal(await store.get(a), null);
});
