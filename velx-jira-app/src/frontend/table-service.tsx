/**
 * Issue Context: "Table service" (UI Kit).
 *
 * Shows how far we get with NO backend at all: the panel reads the issue in the
 * browser with requestJira, which always runs as the current user. Restaurant mapping:
 *   - table  = the issue number
 *   - waiter = the assignee
 *   - course = the status category (To do = seated, In progress = being served, Done = paid)
 *   - VIP    = High or Highest priority
 *   - dietary notes = labels
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Inline,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  useProductContext,
} from '@forge/react';
import { events, requestJira } from '@forge/bridge';
import { errorMessage } from './types';

/** The issue fields this panel reads from Jira. */
interface JiraIssue {
  fields: {
    summary: string;
    status?: { statusCategory?: { key?: string } };
    assignee?: { displayName?: string } | null;
    priority?: { name?: string };
    labels?: string[];
  };
}

type LozengeAppearance = 'default' | 'inprogress' | 'success';

// Status category key from Jira -> restaurant wording and lozenge colour.
const COURSE_BY_CATEGORY: Record<string, { label: string; appearance: LozengeAppearance }> = {
  new: { label: 'Seated', appearance: 'default' },
  indeterminate: { label: 'Being served', appearance: 'inprogress' },
  done: { label: 'Paid', appearance: 'success' },
};

const App = () => {
  const context = useProductContext();
  const issueKey: string | undefined = context?.extension?.issue?.key;

  const [issue, setIssue] = useState<JiraIssue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIssue = useCallback(async () => {
    if (!issueKey) return;
    try {
      const fields = 'summary,status,assignee,priority,labels';
      const res = await requestJira(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`
      );
      if (!res.ok) throw new Error(`Jira answered ${res.status}`);
      setIssue((await res.json()) as JiraIssue);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [issueKey]);

  // Load once the context is known, and reload whenever the issue changes in Jira.
  useEffect(() => {
    loadIssue();
    const subscription = events.on('JIRA_ISSUE_CHANGED', loadIssue);
    return () => {
      subscription.then((sub) => sub.unsubscribe());
    };
  }, [loadIssue]);

  if (error) {
    return (
      <SectionMessage appearance="error" title="Could not read the order">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }
  if (!issue || !issueKey) return <Spinner label="Checking the table" />;

  const { fields } = issue;
  const tableNumber = issueKey.split('-').pop();
  const course = COURSE_BY_CATEGORY[fields.status?.statusCategory?.key ?? 'new'] ?? COURSE_BY_CATEGORY.new;
  const isVip = ['Highest', 'High'].includes(fields.priority?.name ?? '');
  const dietary = fields.labels ?? [];

  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Text weight="bold">Table {tableNumber}</Text>
        <Lozenge appearance={course.appearance}>{course.label}</Lozenge>
        {isVip ? <Lozenge appearance="discovery" isBold>VIP</Lozenge> : null}
      </Inline>
      <Text>Waiter: {fields.assignee?.displayName ?? 'Nobody yet'}</Text>
      <Text>Order: {fields.summary}</Text>
      <Inline space="space.050" shouldWrap>
        <Text>Dietary notes:</Text>
        {dietary.length === 0 ? (
          <Text>none</Text>
        ) : (
          dietary.map((label) => (
            <Lozenge key={label} appearance="moved">
              {label}
            </Lozenge>
          ))
        )}
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
