/**
 * Issue Activity: "Kitchen log" (UI Kit).
 *
 * Adds a tab to the issue's Activity section listing everything the kitchen backend
 * recorded for this issue. Data flows backend -> module: the backend picks the issue
 * from the signed token, so the request carries no parameters at all.
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  DynamicTable,
  Inline,
  SectionMessage,
  Stack,
  Text,
  User,
} from '@forge/react';
import { invokeRemote } from '@forge/bridge';

const HEAD = {
  cells: [
    { key: 'when', content: 'When' },
    { key: 'what', content: 'What happened' },
    { key: 'who', content: 'Who' },
  ],
};

const App = () => {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const loadLog = useCallback(async () => {
    try {
      const res = await invokeRemote({ path: '/kitchen/log', method: 'GET' });
      if (res.status >= 300) throw new Error(res.body?.error ?? `Kitchen answered ${res.status}`);
      setEntries(res.body.entries);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  if (error) {
    return (
      <SectionMessage appearance="warning" title="The kitchen is not answering">
        <Text>{error}</Text>
      </SectionMessage>
    );
  }

  const rows = (entries ?? []).map((entry, index) => ({
    key: `entry-${index}`,
    cells: [
      { key: 'when', content: new Date(entry.at).toLocaleString() },
      { key: 'what', content: entry.text },
      { key: 'who', content: entry.accountId ? <User accountId={entry.accountId} /> : 'Kitchen' },
    ],
  }));

  return (
    <Stack space="space.100">
      <DynamicTable
        caption="Kitchen log"
        head={HEAD}
        rows={rows}
        isLoading={entries === null}
        rowsPerPage={10}
        emptyView={<Text>No orders yet. Use "Send to kitchen" in the ••• menu.</Text>}
      />
      <Inline alignInline="end">
        <Button appearance="subtle" onClick={loadLog}>
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
