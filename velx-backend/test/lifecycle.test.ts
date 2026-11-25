// The lifecycle table, the journal entries each move writes, and the in-memory Velx stub.
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/errors.ts';
import { advance, fail, LIFECYCLE, rowIndexOf, start } from '../src/velx/lifecycle.ts';
import { buildSeed, SEED_DATASOURCES } from '../src/velx/seed.ts';
import { StubVelxClient } from '../src/velx/stub.ts';
import { INITIATIVE_STATUSES, STEP_TYPES } from '../src/velx/types.ts';

const actor = { username: 'tester' };

test('lifecycle walks statuses and steps in Velx order', () => {
  const statuses = [...new Set(LIFECYCLE.map((r) => r.status))];
  assert.deepEqual(statuses, [...INITIATIVE_STATUSES]);
  const steps = [...new Set(LIFECYCLE.map((r) => r.step))];
  assert.deepEqual(steps, [...STEP_TYPES]);
  assert.equal(LIFECYCLE.at(-1)?.stepStatus, 'completed');
});

test('advancing from a waiting row records the people part, then the agent part', () => {
  let { position } = start();
  ({ position } = advance(position)); // as-is waiting_for_feedback
  const { position: next, entries } = advance(position);
  assert.equal(next.currentStepStatus, 'waiting_for_approval');
  assert.deepEqual(
    entries.map((e) => [e.source, e.tag]),
    [
      ['user', 'note'],
      ['agent', 'plan-revision'],
    ]
  );
  assert.match(entries[0].content, /Answered the AS-IS/);
});

test('advancing past Implemented is a 409', () => {
  const last = LIFECYCLE.at(-1)!;
  const position = { status: last.status, currentStep: last.step, currentStepStatus: last.stepStatus };
  assert.throws(() => advance(position), (e: unknown) => e instanceof HttpError && e.status === 409);
});

test('a failed step starts again from its first row', () => {
  const row = LIFECYCLE[4]; // to-be waiting_for_approval
  const failed = fail({ status: row.status, currentStep: row.step, currentStepStatus: row.stepStatus });
  assert.equal(failed.position.currentStepStatus, 'failed');
  assert.match(failed.position.failureReason ?? '', /TO-BE/);
  assert.throws(() => fail(failed.position), (e: unknown) => e instanceof HttpError && e.status === 409);

  const retried = advance(failed.position);
  assert.equal(rowIndexOf(retried.position), 3); // to-be thinking
  assert.equal(retried.position.failureReason, undefined);
});

test('seed data is synthetic, consistent and has one archived initiative', () => {
  const seed = buildSeed();
  const known = new Set(SEED_DATASOURCES.map((d) => d.datasourceId));
  for (const i of seed.initiatives) {
    assert.ok(rowIndexOf(i) >= 0, `${i.title} sits on a lifecycle row`);
    for (const id of [...i.targetDatasourceIds, ...i.contextDatasourceIds]) assert.ok(known.has(id));
    assert.ok(seed.journal.some((e) => e.initiativeId === i.initiativeId));
  }
  assert.equal(seed.initiatives.filter((i) => i.archiveStatus.state === 'archived').length, 1);
  assert.ok(SEED_DATASOURCES.every((d) => d.datasourceId.startsWith('resource:')));
});

test('stub lists active initiatives only and resolves repositories on detail', async () => {
  const velx = new StubVelxClient();
  const { data } = await velx.listInitiatives();
  assert.equal(data.length, 5);
  assert.ok(data.every((i) => i.archiveStatus.state === 'active'));

  const res = await velx.getInitiative('3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e02');
  assert.deepEqual(
    res?.data.initiative.datasources.map((d) => [d.name, d.role, d.branch]),
    [
      ['sample-org/web-portal', 'target', 'main'],
      ['sample-org/payments-api', 'context', 'main'],
    ]
  );
  assert.equal(await velx.getInitiative('3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4eff'), null);
});

test('stub creates initiatives the way Velx validates them', async () => {
  const velx = new StubVelxClient({ newId: () => '11111111-2222-4333-8444-555555555555' });
  const target = SEED_DATASOURCES[0].datasourceId;
  const is400 = (e: unknown) => e instanceof HttpError && e.status === 400;

  await assert.rejects(velx.createInitiative({ title: ' ', initiativeGoal: '', targetDatasourceIds: [target] }, actor), is400);
  await assert.rejects(velx.createInitiative({ title: 'x'.repeat(201), initiativeGoal: '', targetDatasourceIds: [target] }, actor), is400);
  await assert.rejects(velx.createInitiative({ title: 'T', initiativeGoal: '', targetDatasourceIds: [] }, actor), is400);
  await assert.rejects(velx.createInitiative({ title: 'T', initiativeGoal: '', targetDatasourceIds: ['resource:nope'] }, actor), is400);

  const res = await velx.createInitiative(
    { title: 'New one', initiativeGoal: 'Goal', targetDatasourceIds: [target], contextDatasourceIds: [target] },
    actor
  );
  const created = res.data.initiative;
  assert.equal(created.status, 'In Planning');
  assert.equal(created.currentStep, 'as-is');
  assert.equal(created.currentStepStatus, 'thinking');
  assert.equal(created.planFormat, 'unified');
  assert.equal(created.createdByUsername, 'tester');
  assert.equal(created.datasources.length, 1, 'a target is not repeated as context');

  const after = await velx.simulateAdvance(created.initiativeId, actor);
  assert.equal(after.data.initiative.currentStepStatus, 'waiting_for_feedback');
  const { data: journal } = await velx.listJournalEntries(created.initiativeId);
  assert.equal(journal.length, 2);
});
