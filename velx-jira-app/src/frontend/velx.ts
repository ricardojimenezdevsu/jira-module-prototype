/**
 * Shared by the UI Kit modules: the shapes the Velx connector answers with, Velx's labels,
 * and one helper to call the connector through Forge Remote.
 */
import { invokeRemote } from '@forge/bridge';

export type InitiativeStatus = 'In Planning' | 'Planned' | 'In Implementation' | 'Implemented';
export type StepType = 'as-is' | 'to-be' | 'implementation-plan' | 'implementation';
export type StepStatus =
  | 'thinking'
  | 'waiting_for_feedback'
  | 'waiting_for_approval'
  | 'waiting_for_implementation'
  | 'implementing'
  | 'completed'
  | 'failed';

export const STEPS: StepType[] = ['as-is', 'to-be', 'implementation-plan', 'implementation'];

/** Velx's own wording (web/src/components/initiatives/initiativeBadgeStyles.ts). */
export const STATUS_LABEL: Record<InitiativeStatus, string> = {
  'In Planning': 'Planning',
  Planned: 'Planned',
  'In Implementation': 'In Implementation',
  Implemented: 'Implemented',
};

export const STATUS_APPEARANCE: Record<InitiativeStatus, 'new' | 'default' | 'inprogress' | 'success'> = {
  'In Planning': 'new',
  Planned: 'default',
  'In Implementation': 'inprogress',
  Implemented: 'success',
};

export const STEP_LABEL: Record<StepType, string> = {
  'as-is': 'AS-IS',
  'to-be': 'TO-BE',
  'implementation-plan': 'Implementation Plan',
  implementation: 'Implementation',
};

export const STEP_STATUS_NOTICE: Record<StepStatus, string> = {
  thinking: 'In progress',
  waiting_for_feedback: 'Needs your answers',
  waiting_for_approval: 'Pending approval',
  waiting_for_implementation: 'Waiting to start',
  implementing: 'Implementing',
  completed: 'Completed',
  failed: 'Failed',
};

export interface Datasource {
  datasourceId: string;
  name: string;
  defaultBranch: string;
}

/** As listed by GET /velx/initiatives. */
export interface InitiativeSummary {
  initiativeId: string;
  title: string;
  status: InitiativeStatus;
  currentStep: StepType;
  currentStepStatus: StepStatus;
}

/** As returned inside GET /jira/link and the create, link and simulate answers. */
export interface Initiative extends InitiativeSummary {
  initiativeGoal: string;
  createdAt: string;
  createdByUsername: string;
  failureReason?: string;
  archiveStatus: { state: 'active' | 'archived'; reason?: string };
  datasources: { id: string; name: string; role: 'target' | 'context'; branch: string }[];
}

export interface IssueLink {
  initiativeId: string;
  linkedAt: string;
}

/** GET /jira/link, PUT /jira/link and POST /jira/initiatives. */
export interface LinkResponse {
  link: IssueLink | null;
  initiative: Initiative | null;
  velxUrl: string | null;
  /** not-found: the linked initiative is gone; invalid-link: the stored link is unreadable. */
  problem?: 'not-found' | 'invalid-link';
}

/** GET /jira/draft. */
export interface DraftResponse {
  title: string;
  initiativeGoal: string;
  issue: { key: string; summary: string; status: string | null };
}

/** One line of GET /jira/journal. */
export interface ActivityEntry {
  at: string;
  source: 'user' | 'agent' | 'jira';
  tag?: 'note' | 'plan-revision';
  step?: StepType;
  velxUsername?: string;
  accountId?: string;
  text: string;
}

/** An error from the connector, with its HTTP status and machine-readable code if any. */
export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

/**
 * Calls the Velx connector. Forge adds the invocation token and the user token, so no issue
 * or user is ever sent from here: the connector reads them from the token.
 * Non-2xx answers with a JSON body resolve instead of throwing, so the status is checked here.
 */
export async function callConnector<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  const res = await invokeRemote({ path, method, ...(body === undefined ? {} : { body }) });
  if (res.status >= 300) {
    const err = res.body as { error?: string; code?: string } | undefined;
    throw new ConnectorError(err?.error ?? `The Velx connector answered ${res.status}`, res.status, err?.code);
  }
  return res.body as T;
}

/** Turns an unknown thrown value into a readable message. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** "Step 2 of 4 · TO-BE · Pending approval" */
export const stepSummary = (i: InitiativeSummary): string =>
  `Step ${STEPS.indexOf(i.currentStep) + 1} of ${STEPS.length} · ${STEP_LABEL[i.currentStep]} · ` +
  STEP_STATUS_NOTICE[i.currentStepStatus];

export const formatDate = (iso: string): string => new Date(iso).toLocaleString();
