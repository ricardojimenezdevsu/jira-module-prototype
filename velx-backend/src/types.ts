/**
 * Shared types for the kitchen backend.
 */
import type { JWTPayload } from 'jose';

/** Claims of a verified Forge Invocation Token (only the parts we read). */
export interface FitClaims extends JWTPayload {
  app?: {
    id?: string;
    installationId?: string;
    apiBaseUrl?: string;
    environment?: { type?: string };
  };
  context?: {
    cloudId?: string;
    siteUrl?: string;
    moduleKey?: string;
    extension?: {
      type?: string;
      issue?: { key?: string; id?: string };
    };
  };
  /** Atlassian account ID of the user who triggered the call. */
  principal?: string;
  /** Present only on Isolated Cloud invocations. */
  icLabel?: string;
}

/** What the auth middleware attaches to every /kitchen request as `req.forge`. */
export interface ForgeRequestContext {
  installationId?: string;
  environment?: string;
  apiBaseUrl?: string;
  cloudId?: string;
  siteUrl?: string;
  moduleKey?: string;
  accountId?: string;
  issueKey?: string;
  issueId?: string;
  /** Opaque OAuth token of the user. Never log it. */
  userToken?: string;
}

/** A node of Atlassian Document Format, the rich-text format of Jira descriptions. */
export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: AdfNode[];
}

/** The issue fields the connector reads from Jira. */
export interface JiraIssue {
  fields: {
    summary: string;
    description?: AdfNode | null;
    status?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    issuetype?: { name?: string };
  };
}

export interface Ticket {
  orderNo: number;
  issueKey: string;
  table: string;
  dish: string;
  course: string;
  dietary: string[];
  rush: boolean;
  prepMinutes: number;
  notes: string;
  jiraStatus: string;
  stages: readonly string[];
  stageIndex: number;
  orderedBy?: string;
  orderedAt: string;
}

export interface LogEntry {
  at: string;
  accountId?: string;
  text: string;
}

/** Everything the kitchen keeps for one issue. */
export interface IssueRecord {
  ticket: Ticket | null;
  log: LogEntry[];
}

export type VerifyFit = (token: string, appId: string) => Promise<FitClaims>;

export type FetchIssue = (args: {
  apiBaseUrl: string;
  userToken: string;
  issueKey: string;
}) => Promise<JiraIssue>;

/** Which issue property a call is about, and who it is made as. */
export interface IssuePropertyArgs {
  apiBaseUrl: string;
  userToken: string;
  issueIdOrKey: string;
  propertyKey: string;
}

export type GetIssueProperty = (args: IssuePropertyArgs) => Promise<unknown>;
export type SetIssueProperty = (args: IssuePropertyArgs & { value: unknown }) => Promise<void>;
export type DeleteIssueProperty = (args: IssuePropertyArgs) => Promise<void>;

export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

/** Dependencies of createApp. They are injected so tests can replace the token check and the Jira call. */
export interface AppDeps {
  /** Our Forge app ID. */
  appId: string;
  verifyFit: VerifyFit;
  fetchIssue: FetchIssue;
  logger?: Logger;
}

// Let Express know about `req.forge`.
declare global {
  namespace Express {
    interface Request {
      forge: ForgeRequestContext;
    }
  }
}
