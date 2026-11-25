/**
 * Issue Panel: "Velx initiative" (UI Kit).
 *
 * The full view of the linked initiative: status, progress through Velx's four steps, the
 * repositories it changes or reads, and its goal. Shown only on linked issues.
 *
 * The "Simulate" buttons exist only because the backend is a stub: real initiatives move on
 * their own as Velx's agents work and people answer and approve in Velx.
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  Inline,
  Link,
  LoadingButton,
  Lozenge,
  ProgressTracker,
  SectionMessage,
  Spinner,
  Stack,
  Tag,
  TagGroup,
  Text,
} from '@forge/react';
import {
  callConnector,
  errorMessage,
  formatDate,
  STATUS_APPEARANCE,
  STATUS_LABEL,
  STEP_LABEL,
  STEPS,
  stepSummary,
  type Initiative,
  type LinkResponse,
} from './velx';

/** Velx's four steps as ProgressTracker stages. */
const stepItems = (initiative: Initiative) => {
  const current = STEPS.indexOf(initiative.currentStep);
  const finished = initiative.currentStepStatus === 'completed';
  return STEPS.map((step, index) => {
    const done = index < current || finished;
    return {
      id: step,
      label: STEP_LABEL[step],
      percentageComplete: done ? 100 : 0,
      status: done ? ('visited' as const) : index === current ? ('current' as const) : ('unvisited' as const),
    };
  });
};

const App = () => {
  const [data, setData] = useState<LinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'advance' | 'fail' | null>(null);

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

  const simulate = async (move: 'advance' | 'fail') => {
    setBusy(move);
    setActionError(null);
    try {
      const { initiative } = await callConnector<{ initiative: Initiative }>(`/jira/simulate/${move}`, 'POST');
      setData((prev) => (prev ? { ...prev, initiative } : prev));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <SectionMessage appearance="warning" title="Velx is not answering">
        <Stack space="space.100">
          <Text>{error}</Text>
          <Inline>
            <Button appearance="subtle" onClick={load}>
              Try again
            </Button>
          </Inline>
        </Stack>
      </SectionMessage>
    );
  }
  if (!data) return <Spinner label="Loading the Velx initiative" />;

  const { initiative, velxUrl } = data;
  if (!initiative) {
    return (
      <SectionMessage appearance="information" title={data.link ? 'Initiative not found' : 'Not linked'}>
        <Text>
          {data.link
            ? 'Velx no longer has the linked initiative (the stub forgets new ones when it restarts). Use "Link to Velx initiative" to fix or remove the link.'
            : 'Use "Link to Velx initiative" or "Create Velx initiative" in the ••• menu.'}
        </Text>
      </SectionMessage>
    );
  }

  const targets = initiative.datasources.filter((d) => d.role === 'target');
  const context = initiative.datasources.filter((d) => d.role === 'context');
  const isFinished = initiative.currentStepStatus === 'completed';

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Heading size="small">{initiative.title}</Heading>
        <Lozenge appearance={STATUS_APPEARANCE[initiative.status]} isBold>
          {STATUS_LABEL[initiative.status]}
        </Lozenge>
      </Inline>

      <ProgressTracker label="Velx initiative steps" items={stepItems(initiative)} spacing="compact" />
      <Text>{stepSummary(initiative)}</Text>

      {initiative.currentStepStatus === 'failed' ? (
        <SectionMessage appearance="error" title="The current step failed">
          <Text>{initiative.failureReason ?? 'Velx could not finish this step.'}</Text>
        </SectionMessage>
      ) : null}

      <Stack space="space.050">
        <Text weight="bold">Target repositories</Text>
        <TagGroup>
          {targets.map((d) => (
            <Tag key={d.id} text={`${d.name} (${d.branch})`} color="blueLight" />
          ))}
        </TagGroup>
      </Stack>
      {context.length > 0 ? (
        <Stack space="space.050">
          <Text weight="bold">Context repositories</Text>
          <TagGroup>
            {context.map((d) => (
              <Tag key={d.id} text={`${d.name} (${d.branch})`} color="greyLight" />
            ))}
          </TagGroup>
        </Stack>
      ) : null}

      <Stack space="space.050">
        <Text weight="bold">Goal</Text>
        <Text>{initiative.initiativeGoal}</Text>
      </Stack>

      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Text size="small" color="color.text.subtlest">
          Created by {initiative.createdByUsername} on {formatDate(initiative.createdAt)}
        </Text>
        {velxUrl ? (
          <Link href={velxUrl} openNewTab>
            Open in Velx
          </Link>
        ) : null}
      </Inline>

      <SectionMessage appearance="discovery" title="Prototype only: simulate Velx">
        <Stack space="space.100">
          <Text>The stub does not run Velx's agents. Move the initiative forward or fail its current step.</Text>
          {actionError ? <Text color="color.text.danger">{actionError}</Text> : null}
          <Inline space="space.100">
            <LoadingButton
              appearance="primary"
              isLoading={busy === 'advance'}
              isDisabled={busy !== null || isFinished}
              onClick={() => simulate('advance')}
            >
              {initiative.currentStepStatus === 'failed' ? 'Retry step' : 'Simulate progress'}
            </LoadingButton>
            <LoadingButton
              appearance="subtle"
              isLoading={busy === 'fail'}
              isDisabled={busy !== null || isFinished || initiative.currentStepStatus === 'failed'}
              onClick={() => simulate('fail')}
            >
              Simulate failure
            </LoadingButton>
            <Button appearance="subtle" isDisabled={busy !== null} onClick={load}>
              Refresh
            </Button>
          </Inline>
        </Stack>
      </SectionMessage>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
