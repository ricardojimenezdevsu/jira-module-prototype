/**
 * Shared types for the Velx connector stub.
 */
import type { JWTPayload } from 'jose';
import type { LinkStore } from './linkStore.ts';
import type { VelxClient } from './velx/client.ts';
import type { JournalEntry, StepType } from './velx/types.ts';

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

/** What the auth middleware attaches to every connector request as `req.forge`. */
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

/**
 * One line of the "Velx journal" activity tab: a Velx journal entry, or something the
 * connector did for this issue (source "jira").
 */
export interface ActivityEntry {
  at: string;
  source: JournalEntry['source'] | 'jira';
  tag?: JournalEntry['tag'];
  step?: StepType;
  /** Velx username, for Velx entries. Not an Atlassian account. */
  velxUsername?: string;
  /** Atlassian account ID, for connector events. */
  accountId?: string;
  text: string;
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

/** Dependencies of createApp. They are injected so tests can replace Jira, Velx and the token check. */
export interface AppDeps {
  /** Our Forge app ID. */
  appId: string;
  verifyFit: VerifyFit;
  fetchIssue: FetchIssue;
  linkStore: LinkStore;
  velx: VelxClient;
  /** Base URL of the Velx web app, for "Open in Velx" links. */
  velxWebUrl: string;
  /** The Velx user every Jira user is treated as until #3755 solves user mapping. */
  velxUsername: string;
  /** Enables the stub-only /jira/simulate routes. */
  simulation: boolean;
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
