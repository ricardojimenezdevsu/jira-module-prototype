/**
 * Issue Action: "Link to Velx initiative" (UI Kit).
 *
 * Opens as a modal from the issue's ••• menu. Links this issue to an existing Velx
 * initiative, changes the link, or removes it. The link is stored by the connector as the
 * issue's `velx-initiative` property, which the other modules use in their display
 * conditions, so the page reloads after a change.
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  HelperMessage,
  Inline,
  Label,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  useProductContext,
} from '@forge/react';
import { router, view } from '@forge/bridge';
import {
  callConnector,
  errorMessage,
  STATUS_APPEARANCE,
  STATUS_LABEL,
  stepSummary,
  type InitiativeSummary,
  type LinkResponse,
} from './velx';

interface Option {
  label: string;
  value: string;
}

type Mode = 'view' | 'pick';

const App = () => {
  const issueKey: string | undefined = useProductContext()?.extension?.issue?.key;

  const [current, setCurrent] = useState<LinkResponse | null>(null);
  const [initiatives, setInitiatives] = useState<InitiativeSummary[] | null>(null);
  const [mode, setMode] = useState<Mode>('pick');
  const [choice, setChoice] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [link, list] = await Promise.all([
        callConnector<LinkResponse>('/jira/link'),
        callConnector<{ data: InitiativeSummary[] }>('/velx/initiatives'),
      ]);
      setCurrent(link);
      setInitiatives(list.data);
      setMode(link.link ? 'view' : 'pick');
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      setDone(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const link = () =>
    run(async () => {
      const res = await callConnector<LinkResponse>('/jira/link', 'PUT', { initiativeId: choice?.value });
      return `${issueKey ?? 'This issue'} is now linked to "${res.initiative?.title}".`;
    });

  const unlink = () =>
    run(async () => {
      await callConnector('/jira/link', 'DELETE');
      return `${issueKey ?? 'This issue'} is no longer linked to a Velx initiative.`;
    });

  // Display conditions are evaluated when the page loads, so reload to show or hide the panels.
  const finish = async () => {
    try {
      await router.reload();
    } catch {
      await view.close();
    }
  };

  if (done) {
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title="Saved">
          <Text>{done}</Text>
        </SectionMessage>
        <Inline alignInline="end">
          <Button appearance="primary" onClick={finish}>
            Done
          </Button>
        </Inline>
      </Stack>
    );
  }

  if (!current || !initiatives) {
    return error ? (
      <SectionMessage appearance="error" title="Velx is not answering">
        <Text>{error}</Text>
      </SectionMessage>
    ) : (
      <Spinner label="Loading Velx initiatives" />
    );
  }

  const errorMessageBlock = error ? (
    <SectionMessage appearance="error" title="That did not work">
      <Text>{error}</Text>
    </SectionMessage>
  ) : null;

  if (mode === 'view' && current.link) {
    const { initiative } = current;
    return (
      <Stack space="space.200">
        <Heading size="small">{issueKey ?? 'This issue'} is linked to a Velx initiative</Heading>
        {initiative ? (
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Text weight="bold">{initiative.title}</Text>
              <Lozenge appearance={STATUS_APPEARANCE[initiative.status]}>{STATUS_LABEL[initiative.status]}</Lozenge>
            </Inline>
            <Text>{stepSummary(initiative)}</Text>
          </Stack>
        ) : (
          <SectionMessage appearance="warning" title="Linked initiative not found">
            <Text>
              {current.problem === 'invalid-link'
                ? 'The stored link is not valid. Link the issue again or unlink it.'
                : 'Velx no longer has this initiative (the stub forgets new ones when it restarts).'}
            </Text>
          </SectionMessage>
        )}
        {errorMessageBlock}
        <Inline space="space.100" alignInline="end">
          <Button appearance="subtle" onClick={() => view.close()}>
            Close
          </Button>
          <LoadingButton appearance="warning" isLoading={busy} onClick={unlink}>
            Unlink
          </LoadingButton>
          <Button appearance="primary" isDisabled={busy} onClick={() => setMode('pick')}>
            Change link
          </Button>
        </Inline>
      </Stack>
    );
  }

  const options: Option[] = initiatives
    .filter((i) => i.initiativeId !== current.link?.initiativeId)
    .map((i) => ({ label: `${i.title} · ${STATUS_LABEL[i.status]}`, value: i.initiativeId }));

  return (
    <Stack space="space.200">
      <Heading size="small">Link {issueKey ?? 'this issue'} to a Velx initiative</Heading>
      <Stack space="space.050">
        <Label labelFor="initiative">Initiative</Label>
        <Select
          inputId="initiative"
          options={options}
          value={choice}
          onChange={(option: Option | null) => setChoice(option)}
          isSearchable
          isClearable
          placeholder="Search initiatives"
        />
        <HelperMessage>Archived initiatives are not listed.</HelperMessage>
      </Stack>
      {errorMessageBlock}
      <Inline space="space.100" alignInline="end">
        <Button appearance="subtle" onClick={() => (current.link ? setMode('view') : view.close())}>
          {current.link ? 'Back' : 'Cancel'}
        </Button>
        <LoadingButton appearance="primary" isLoading={busy} isDisabled={!choice} onClick={link}>
          Link
        </LoadingButton>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
