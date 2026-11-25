/**
 * Calls to Jira on behalf of the user who clicked in the Forge module.
 *
 * `apiBaseUrl` comes from the verified FIT (for example
 * https://api.atlassian.com/ex/jira/<cloudId>) and `userToken` from the
 * `x-forge-oauth-user` header. Jira applies the user's own permissions, so we only ever
 * see or change what that user could see or change in the browser.
 */
import { HttpError } from './errors.ts';
import type {
  DeleteIssueProperty,
  FetchIssue,
  GetIssueProperty,
  JiraIssue,
  SetIssueProperty,
} from './types.ts';

export { HttpError };

const FIELDS = ['summary', 'description', 'status', 'priority', 'labels', 'issuetype'].join(',');

interface JiraRequest {
  apiBaseUrl: string;
  userToken: string;
  method?: 'GET' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** What the call is for, used in error messages. */
  what: string;
  /** Statuses that are not errors for this call (for example 404 when reading a property). */
  allow?: number[];
}

/**
 * Sends one request to Jira as the user. Errors become HttpErrors the connector can answer
 * with: 404 and 403 pass through, anything else (including 401) becomes 502, because Forge
 * reserves 401 for token verification failures.
 */
async function jiraRequest({ apiBaseUrl, userToken, method = 'GET', path, body, what, allow = [] }: JiraRequest) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !allow.includes(res.status)) {
    const status = res.status === 404 || res.status === 403 ? res.status : 502;
    throw new HttpError(status, `Jira answered ${res.status} when ${what}`);
  }
  return res;
}

const propertyPath = (issueIdOrKey: string, propertyKey: string) =>
  `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/properties/${encodeURIComponent(propertyKey)}`;

export const fetchIssue: FetchIssue = async ({ apiBaseUrl, userToken, issueKey }) => {
  const res = await jiraRequest({
    apiBaseUrl,
    userToken,
    path: `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${FIELDS}`,
    what: `reading ${issueKey}`,
  });
  return (await res.json()) as JiraIssue;
};

/** Reads an issue property's value, or null when the issue has none. */
export const getIssueProperty: GetIssueProperty = async ({ apiBaseUrl, userToken, issueIdOrKey, propertyKey }) => {
  const res = await jiraRequest({
    apiBaseUrl,
    userToken,
    path: propertyPath(issueIdOrKey, propertyKey),
    what: `reading property ${propertyKey} of ${issueIdOrKey}`,
    allow: [404],
  });
  if (res.status === 404) return null;
  const body = (await res.json()) as { value?: unknown };
  return body.value ?? null;
};

/** Creates or replaces an issue property. Jira requires permission to edit the issue. */
export const setIssueProperty: SetIssueProperty = async ({ apiBaseUrl, userToken, issueIdOrKey, propertyKey, value }) => {
  await jiraRequest({
    apiBaseUrl,
    userToken,
    method: 'PUT',
    path: propertyPath(issueIdOrKey, propertyKey),
    body: value,
    what: `saving property ${propertyKey} on ${issueIdOrKey}`,
  });
};

/** Deletes an issue property. Deleting one that does not exist is not an error. */
export const deleteIssueProperty: DeleteIssueProperty = async ({ apiBaseUrl, userToken, issueIdOrKey, propertyKey }) => {
  await jiraRequest({
    apiBaseUrl,
    userToken,
    method: 'DELETE',
    path: propertyPath(issueIdOrKey, propertyKey),
    what: `deleting property ${propertyKey} from ${issueIdOrKey}`,
    allow: [404],
  });
};
