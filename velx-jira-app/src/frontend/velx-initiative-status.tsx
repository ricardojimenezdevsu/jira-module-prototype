/**
 * Issue Context: "Velx initiative" (UI Kit).
 *
 * A compact view in the issue's right-hand details: which initiative this issue is linked to,
 * its status and where it is in Velx's pipeline. Shown only on linked issues (display
 * condition on the `velx-initiative` issue property).
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { callConnector, errorMessage, STATUS_APPEARANCE, STATUS_LABEL, stepSummary, type LinkResponse } from './velx';

const App = () => {
  const [data, setData] = useState<LinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await callConnector<LinkResponse>('/jira/link'));
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
  if (!data) return <Spinner label="Loading the Velx initiative" />;

  const { initiative, velxUrl } = data;
  if (!initiative) {
    return (
      <Text>
        {data.link
          ? 'The linked initiative was not found in Velx. Use "Link to Velx initiative" to fix the link.'
          : 'Not linked to a Velx initiative.'}
      </Text>
    );
  }

  return (
    <Stack space="space.100">
      <Text weight="bold">{initiative.title}</Text>
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Lozenge appearance={STATUS_APPEARANCE[initiative.status]}>{STATUS_LABEL[initiative.status]}</Lozenge>
        {initiative.currentStepStatus === 'failed' ? <Lozenge appearance="removed">Failed</Lozenge> : null}
      </Inline>
      <Text size="small">{stepSummary(initiative)}</Text>
      <Inline space="space.100" alignBlock="center" spread="space-between">
        {velxUrl ? (
          <Link href={velxUrl} openNewTab>
            Open in Velx
          </Link>
        ) : null}
        <Button appearance="subtle" spacing="compact" onClick={load}>
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
