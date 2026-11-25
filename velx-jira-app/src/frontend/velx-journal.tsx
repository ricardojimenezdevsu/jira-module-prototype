/**
 * Issue Activity: "Velx journal" (UI Kit).
 *
 * A tab in the issue's Activity section: the linked initiative's Velx journal (agent notes,
 * plan revisions, answers and approvals) together with what the connector did for this issue
 * (linked, created, unlinked). Velx entries name a Velx user, which is not an Atlassian
 * account, so it is shown as text.
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  DynamicTable,
  Inline,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  User,
} from '@forge/react';
import { callConnector, errorMessage, formatDate, STEP_LABEL, type ActivityEntry } from './velx';

const HEAD = {
  cells: [
    { key: 'when', content: 'When' },
    { key: 'step', content: 'Step' },
    { key: 'source', content: 'Source' },
    { key: 'entry', content: 'Entry' },
    { key: 'who', content: 'Who' },
  ],
};

const SOURCE: Record<ActivityEntry['source'], { label: string; appearance: 'new' | 'default' | 'moved' }> = {
  agent: { label: 'Velx agent', appearance: 'new' },
  user: { label: 'Velx user', appearance: 'default' },
  jira: { label: 'Jira', appearance: 'moved' },
};

const App = () => {
  // entries: null while loading.
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries((await callConnector<{ entries: ActivityEntry[] }>('/jira/journal')).entries);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <SectionMessage appearance="warning" title="Velx is not answering">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }

  const rows = (entries ?? []).map((entry, index) => ({
    key: `entry-${index}`,
    cells: [
      { key: 'when', content: formatDate(entry.at) },
      { key: 'step', content: entry.step ? STEP_LABEL[entry.step] : '' },
      {
        key: 'source',
        content: <Lozenge appearance={SOURCE[entry.source].appearance}>{SOURCE[entry.source].label}</Lozenge>,
      },
      {
        key: 'entry',
        content: entry.tag === 'plan-revision' ? `Plan revision: ${entry.text}` : entry.text,
      },
      {
        key: 'who',
        content: entry.accountId ? <User accountId={entry.accountId} /> : (entry.velxUsername ?? ''),
      },
    ],
  }));

  return (
    <Stack space="space.100">
      <DynamicTable
        caption="Velx journal"
        head={HEAD}
        rows={rows}
        isLoading={entries === null}
        rowsPerPage={10}
        emptyView={<Text>Nothing yet. Link or create a Velx initiative from the ••• menu.</Text>}
      />
      <Inline alignInline="end">
        <Button appearance="subtle" onClick={load}>
          Refresh
        </Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
