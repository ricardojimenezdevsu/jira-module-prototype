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

/** The issue fields the kitchen reads from Jira. */
export interface JiraIssue {
  fields: {
    summary: string;
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
