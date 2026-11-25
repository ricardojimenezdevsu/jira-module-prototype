/**
 * Where the link between a Jira issue and a Velx initiative is kept.
 *
 * By default it is a Jira issue property (`velx-initiative`), written with the user's token:
 * Jira checks that the user may edit the issue, the link survives connector restarts, and
 * the Forge modules use it in display conditions. Anyone who can edit the issue can also
 * change the property through the REST API, so its value is validated on every read.
 *
 * The memory store keeps links in this process only. Tests use it, and LINK_STORE=memory
 * selects it when the Jira write scope is not available.
 */
import type { DeleteIssueProperty, GetIssueProperty, Logger, SetIssueProperty } from './types.ts';

export const LINK_PROPERTY = 'velx-initiative';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** What is stored for a linked issue. */
export interface IssueLink {
  v: 1;
  initiativeId: string;
  linkedAt: string;
}

/** The issue a link belongs to and the user the store acts as. All of it comes from the FIT. */
export interface LinkTarget {
  apiBaseUrl: string;
  userToken: string;
  cloudId: string;
  issueId: string;
  issueKey: string;
}

/** A stored value that is not a valid link (for example edited by hand). */
export const INVALID_LINK = 'invalid' as const;

export interface LinkStore {
  readonly kind: 'jira-property' | 'memory';
  get(target: LinkTarget): Promise<IssueLink | typeof INVALID_LINK | null>;
  set(target: LinkTarget, link: IssueLink): Promise<void>;
  delete(target: LinkTarget): Promise<void>;
}

/** Checks an untrusted stored value. */
export const parseLink = (value: unknown): IssueLink | typeof INVALID_LINK | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return INVALID_LINK;
  const { v, initiativeId, linkedAt } = value as Record<string, unknown>;
  if (v !== 1 || !isUuid(initiativeId) || typeof linkedAt !== 'string') return INVALID_LINK;
  return { v: 1, initiativeId, linkedAt };
};

export interface JiraPropertyDeps {
  getIssueProperty: GetIssueProperty;
  setIssueProperty: SetIssueProperty;
  deleteIssueProperty: DeleteIssueProperty;
  logger: Logger;
}

export const createJiraPropertyLinkStore = ({
  getIssueProperty,
  setIssueProperty,
  deleteIssueProperty,
  logger,
}: JiraPropertyDeps): LinkStore => {
  // The issue id is stable; the key changes when an issue moves to another project.
  const args = (t: LinkTarget) => ({
    apiBaseUrl: t.apiBaseUrl,
    userToken: t.userToken,
    issueIdOrKey: t.issueId || t.issueKey,
    propertyKey: LINK_PROPERTY,
  });
  return {
    kind: 'jira-property',
    async get(t) {
      return parseLink(await getIssueProperty(args(t)));
    },
    async set(t, link) {
      await setIssueProperty({ ...args(t), value: link });
      logger.log(`[jira] property ${LINK_PROPERTY} set on ${t.issueKey} -> ${link.initiativeId}`);
    },
    async delete(t) {
      await deleteIssueProperty(args(t));
      logger.log(`[jira] property ${LINK_PROPERTY} deleted from ${t.issueKey}`);
    },
  };
};

export const createMemoryLinkStore = (): LinkStore => {
  const links = new Map<string, IssueLink>();
  const key = (t: LinkTarget) => `${t.cloudId}:${t.issueId || t.issueKey}`;
  return {
    kind: 'memory',
    async get(t) {
      return links.get(key(t)) ?? null;
    },
    async set(t, link) {
      links.set(key(t), link);
    },
    async delete(t) {
      links.delete(key(t));
    },
  };
};
