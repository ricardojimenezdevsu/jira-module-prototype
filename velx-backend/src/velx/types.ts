/**
 * Velx (app-scanner) initiative shapes, mirrored from the app-scanner repo:
 *   core/packages/lib/initiatives/initiative.ts (domain types)
 *   core/apps/oak-app/src/routes/api/initiatives.ts (REST routes and envelopes)
 *
 * Fields marked ASSUMED are not confirmed against Velx and must be checked before a real
 * client replaces the stub.
 */

/** Initiative status, in lifecycle order. Velx shows "In Planning" as "Planning". */
export const INITIATIVE_STATUSES = ['In Planning', 'Planned', 'In Implementation', 'Implemented'] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

/** Steps of a "unified" initiative, in order. Legacy initiatives have other steps; the stub has none. */
export const STEP_TYPES = ['as-is', 'to-be', 'implementation-plan', 'implementation'] as const;
export type StepType = (typeof STEP_TYPES)[number];

export type StepStatus =
  | 'thinking'
  | 'waiting_for_feedback'
  | 'waiting_for_approval'
  | 'waiting_for_implementation'
  | 'implementing'
  | 'completed'
  | 'failed';

export interface ArchiveStatus {
  state: 'active' | 'archived';
  reason?: string;
}

/** A repository from the Velx portfolio. ASSUMED: endpoint path and field names. */
export interface Datasource {
  /** Velx resource id, `resource:<uuid>`. */
  datasourceId: string;
  /** Repository name, e.g. `sample-org/payments-api`. */
  name: string;
  defaultBranch: string;
}

/** Initiative as listed by GET /api/initiatives. */
export interface Initiative {
  initiativeId: string;
  /** At most 200 characters. */
  title: string;
  /** Markdown. */
  initiativeGoal: string;
  targetDatasourceIds: string[];
  contextDatasourceIds: string[];
  standardIds: string[];
  /** ASSUMED shape: datasource id -> branch. */
  datasourceBranches: Record<string, string>;
  status: InitiativeStatus;
  createdAt: string;
  currentStep: StepType;
  currentStepStatus: StepStatus;
  /** ASSUMED: Velx keeps the failure reason on the step, not on the initiative. */
  failureReason?: string;
  /** ASSUMED values. */
  archiveStatus: ArchiveStatus;
  createdByUsername: string;
  planFormat: 'unified';
}

/** A datasource as GET /api/initiatives/:id returns it inside the initiative. */
export interface InitiativeDatasource {
  id: string;
  name: string;
  role: 'target' | 'context';
  branch: string;
}

/** Initiative as returned by GET /api/initiatives/:id: id arrays replaced by resolved objects. */
export interface InitiativeDetail
  extends Omit<Initiative, 'targetDatasourceIds' | 'contextDatasourceIds' | 'standardIds'> {
  datasources: InitiativeDatasource[];
  standards: { id: string; name: string }[];
}

/** One implementation journal entry. ASSUMED field names; Velx stores source, tag and data. */
export interface JournalEntry {
  entryId: string;
  initiativeId: string;
  createdAt: string;
  source: 'user' | 'agent';
  tag: 'note' | 'plan-revision';
  step: StepType;
  authorUsername: string;
  content: string;
}

/** Body of POST /api/initiatives. */
export interface CreateInitiativeBody {
  title: string;
  initiativeGoal: string;
  targetDatasourceIds: string[];
  contextDatasourceIds?: string[];
  standardIds?: string[];
  datasourceBranches?: Record<string, string>;
}

/** Envelope of list endpoints. */
export interface ListResponse<T> {
  data: T[];
}

/** Envelope of GET /api/initiatives/:id and POST /api/initiatives. ASSUMED for POST. */
export interface InitiativeResponse {
  success: true;
  data: { initiative: InitiativeDetail };
}

/** Who a call to Velx is made as. The real integration gets this from Velx auth (#3755). */
export interface VelxActor {
  username: string;
}
