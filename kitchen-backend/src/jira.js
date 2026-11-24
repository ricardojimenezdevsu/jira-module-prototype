/**
 * Reads an issue from Jira on behalf of the user who clicked in the Forge module.
 *
 * `apiBaseUrl` comes from the verified FIT (for example
 * https://api.atlassian.com/ex/jira/<cloudId>) and `userToken` from the
 * `x-forge-oauth-user` header. Jira applies the user's own permissions, so we only ever
 * see what that user could see in the browser.
 */
const FIELDS = ['summary', 'status', 'priority', 'labels', 'issuetype'].join(',');

export async function fetchIssue({ apiBaseUrl, userToken, issueKey }) {
  const url = `${apiBaseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${FIELDS}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const error = new Error(`Jira answered ${res.status} when reading ${issueKey}`);
    // 404 means the user cannot see the issue; anything else is an upstream problem.
    // Never pass 401 through: Forge reserves 401 for token verification failures.
    error.status = res.status === 404 ? 404 : 502;
    throw error;
  }
  return res.json();
}
