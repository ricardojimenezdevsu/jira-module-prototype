/**
 * The path an initiative takes through Velx, as an ordered table, plus the journal entries
 * each move produces. The stub walks this table to fake progress; real Velx moves on its
 * own as its agents work and people answer or approve.
 */
import { HttpError } from '../errors.ts';
import type { InitiativeStatus, JournalEntry, StepStatus, StepType } from './types.ts';

export const STEP_LABEL: Record<StepType, string> = {
  'as-is': 'AS-IS',
  'to-be': 'TO-BE',
  'implementation-plan': 'Implementation Plan',
  implementation: 'Implementation',
};

/** A journal entry before it gets an id, a date and an initiative. */
export type JournalDraft = Pick<JournalEntry, 'source' | 'tag' | 'step' | 'content'> & {
  /** Set for agent entries; user entries are written by the actor. */
  authorUsername?: string;
};

export interface LifecycleRow {
  status: InitiativeStatus;
  step: StepType;
  stepStatus: StepStatus;
  /** What the Velx agent writes in the journal when the initiative reaches this row. */
  onEnter: { tag: JournalEntry['tag']; content: string };
}

const AGENT = 'velx-agent';

export const LIFECYCLE: readonly LifecycleRow[] = [
  { status: 'In Planning', step: 'as-is', stepStatus: 'thinking', onEnter: { tag: 'note', content: 'Started the AS-IS analysis of the target repositories' } },
  { status: 'In Planning', step: 'as-is', stepStatus: 'waiting_for_feedback', onEnter: { tag: 'note', content: 'The AS-IS analysis has questions for the team' } },
  { status: 'In Planning', step: 'as-is', stepStatus: 'waiting_for_approval', onEnter: { tag: 'plan-revision', content: 'AS-IS analysis ready for review' } },
  { status: 'In Planning', step: 'to-be', stepStatus: 'thinking', onEnter: { tag: 'note', content: 'Started the TO-BE design' } },
  { status: 'In Planning', step: 'to-be', stepStatus: 'waiting_for_approval', onEnter: { tag: 'plan-revision', content: 'TO-BE design ready for review' } },
  { status: 'In Planning', step: 'implementation-plan', stepStatus: 'thinking', onEnter: { tag: 'note', content: 'Started the implementation plan' } },
  { status: 'In Planning', step: 'implementation-plan', stepStatus: 'waiting_for_approval', onEnter: { tag: 'plan-revision', content: 'Implementation plan ready for review' } },
  { status: 'Planned', step: 'implementation', stepStatus: 'waiting_for_implementation', onEnter: { tag: 'note', content: 'Plan approved. Waiting for a coding agent to start' } },
  { status: 'In Implementation', step: 'implementation', stepStatus: 'implementing', onEnter: { tag: 'note', content: 'A coding agent started the implementation' } },
  { status: 'Implemented', step: 'implementation', stepStatus: 'completed', onEnter: { tag: 'note', content: 'Implementation finished' } },
];

/** Where an initiative is in its lifecycle. */
export interface LifecyclePosition {
  status: InitiativeStatus;
  currentStep: StepType;
  currentStepStatus: StepStatus;
  failureReason?: string;
}

const rowToPosition = (row: LifecycleRow): LifecyclePosition => ({
  status: row.status,
  currentStep: row.step,
  currentStepStatus: row.stepStatus,
});

const enterEntry = (row: LifecycleRow): JournalDraft => ({
  source: 'agent',
  tag: row.onEnter.tag,
  step: row.step,
  content: row.onEnter.content,
  authorUsername: AGENT,
});

/** Index of the row matching a position that is not failed, or -1. */
export const rowIndexOf = (p: LifecyclePosition): number =>
  LIFECYCLE.findIndex(
    (row) => row.status === p.status && row.step === p.currentStep && row.stepStatus === p.currentStepStatus
  );

/** The first row of a step: where a failed step starts again. */
const firstRowOfStep = (step: StepType): number => LIFECYCLE.findIndex((row) => row.step === step);

/** Position and journal entry of a new initiative. */
export const start = (): { position: LifecyclePosition; entries: JournalDraft[] } => ({
  position: rowToPosition(LIFECYCLE[0]),
  entries: [enterEntry(LIFECYCLE[0])],
});

/**
 * Moves one row forward. Leaving a row that waited for people adds a user entry
 * (answers or approval) written by the actor. A failed step starts again from its first row.
 * Throws 409 when the initiative is already Implemented.
 */
export const advance = (
  p: LifecyclePosition
): { position: LifecyclePosition; entries: JournalDraft[] } => {
  if (p.currentStepStatus === 'failed') {
    const row = LIFECYCLE[firstRowOfStep(p.currentStep)];
    return {
      position: rowToPosition(row),
      entries: [{ source: 'user', tag: 'note', step: row.step, content: `Retried the ${STEP_LABEL[row.step]} step` }, enterEntry(row)],
    };
  }

  const index = rowIndexOf(p);
  if (index < 0) throw new HttpError(409, `Unknown lifecycle position ${p.status}/${p.currentStep}/${p.currentStepStatus}`);
  if (index === LIFECYCLE.length - 1) throw new HttpError(409, 'This initiative is already Implemented');

  const from = LIFECYCLE[index];
  const to = LIFECYCLE[index + 1];
  const entries: JournalDraft[] = [];
  if (from.stepStatus === 'waiting_for_feedback') {
    entries.push({ source: 'user', tag: 'note', step: from.step, content: `Answered the ${STEP_LABEL[from.step]} questions` });
  } else if (from.stepStatus === 'waiting_for_approval') {
    entries.push({ source: 'user', tag: 'note', step: from.step, content: `Approved the ${STEP_LABEL[from.step]}` });
  }
  entries.push(enterEntry(to));
  return { position: rowToPosition(to), entries };
};

/** Fails the current step. Throws 409 when there is nothing left to fail. */
export const fail = (p: LifecyclePosition): { position: LifecyclePosition; entries: JournalDraft[] } => {
  if (p.currentStepStatus === 'failed') throw new HttpError(409, 'The current step has already failed');
  if (p.currentStepStatus === 'completed') throw new HttpError(409, 'This initiative is already Implemented');
  const failureReason = `The ${STEP_LABEL[p.currentStep]} step could not finish (simulated failure)`;
  return {
    position: { ...p, currentStepStatus: 'failed', failureReason },
    entries: [{ source: 'agent', tag: 'note', step: p.currentStep, content: failureReason, authorUsername: AGENT }],
  };
};
