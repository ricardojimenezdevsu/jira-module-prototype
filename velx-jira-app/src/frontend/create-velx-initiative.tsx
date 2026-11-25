/**
 * Issue Action: "Create Velx initiative" (UI Kit).
 *
 * Opens as a modal from the issue's ••• menu. The connector reads the issue as the user and
 * suggests a title (the summary) and a goal (the description as Markdown plus a link back to
 * the issue). The user picks the repositories the initiative changes; the connector creates
 * the initiative in Velx and links this issue to it.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Checkbox,
  ErrorMessage,
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
  TextArea,
  Textfield,
} from '@forge/react';
import { router, view } from '@forge/bridge';
import {
  callConnector,
  ConnectorError,
  errorMessage,
  STATUS_APPEARANCE,
  STATUS_LABEL,
  stepSummary,
  type Datasource,
  type DraftResponse,
  type Initiative,
  type LinkResponse,
} from './velx';

const TITLE_MAX = 200;

interface Option {
  label: string;
  value: string;
}

const App = () => {
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [current, setCurrent] = useState<LinkResponse | null>(null);
  const [repos, setRepos] = useState<Datasource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [targets, setTargets] = useState<Option[]>([]);
  const [context, setContext] = useState<Option[]>([]);
  const [replaceLink, setReplaceLink] = useState(false);
  const [touched, setTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Initiative | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, link, list] = await Promise.all([
          callConnector<DraftResponse>('/jira/draft'),
          callConnector<LinkResponse>('/jira/link'),
          callConnector<{ data: Datasource[] }>('/velx/datasources'),
        ]);
        setDraft(d);
        setTitle(d.title);
        setGoal(d.initiativeGoal);
        setCurrent(link);
        setRepos(list.data);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
    })();
  }, []);

  if (loadError) {
    return (
      <SectionMessage appearance="error" title="Could not prepare the initiative">
        <Text>{loadError}</Text>
      </SectionMessage>
    );
  }
  if (!draft || !current || !repos) return <Spinner label="Reading the issue" />;

  if (created) {
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title="Initiative created in Velx">
          <Text>
            "{created.title}" was created and {draft.issue.key} is linked to it. Velx starts with the AS-IS analysis.
          </Text>
        </SectionMessage>
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={STATUS_APPEARANCE[created.status]}>{STATUS_LABEL[created.status]}</Lozenge>
          <Text>{stepSummary(created)}</Text>
        </Inline>
        <Inline alignInline="end">
          <Button
            appearance="primary"
            onClick={async () => {
              // Display conditions are evaluated on page load, so reload to show the Velx panels.
              try {
                await router.reload();
              } catch {
                await view.close();
              }
            }}
          >
            Done
          </Button>
        </Inline>
      </Stack>
    );
  }

  const repoOption = (d: Datasource): Option => ({ label: d.name, value: d.datasourceId });
  const targetIds = targets.map((t) => t.value);
  const contextOptions = repos.filter((r) => !targetIds.includes(r.datasourceId)).map(repoOption);

  const linked = current.link && current.initiative ? current.initiative : null;
  const titleError = !title.trim() ? 'Enter a title' : title.length > TITLE_MAX ? `At most ${TITLE_MAX} characters` : null;
  const targetError = targets.length === 0 ? 'Pick at least one repository' : null;
  const canCreate = !titleError && !targetError && (!linked || replaceLink);

  const create = async () => {
    setTouched(true);
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callConnector<LinkResponse>('/jira/initiatives', 'POST', {
        title,
        initiativeGoal: goal,
        targetDatasourceIds: targetIds,
        contextDatasourceIds: context.map((c) => c.value).filter((id) => !targetIds.includes(id)),
        replaceLink: Boolean(linked) && replaceLink,
      });
      setCreated(res.initiative);
    } catch (err) {
      setError(
        err instanceof ConnectorError && err.code === 'already-linked'
          ? 'This issue was linked to an initiative meanwhile. Close and open the action again.'
          : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.200">
      <Heading size="small">Create a Velx initiative from {draft.issue.key}</Heading>

      {linked ? (
        <SectionMessage appearance="warning" title={`${draft.issue.key} is already linked`}>
          <Stack space="space.100">
            <Text>
              It is linked to "{linked.title}" ({STATUS_LABEL[linked.status]}). The new initiative will replace that
              link. The existing initiative stays in Velx.
            </Text>
            <Checkbox
              name="replace-link"
              label="Replace the link"
              isChecked={replaceLink}
              onChange={() => setReplaceLink(!replaceLink)}
            />
          </Stack>
        </SectionMessage>
      ) : null}

      <Stack space="space.050">
        <Label labelFor="title">Title</Label>
        <Textfield
          id="title"
          name="title"
          value={title}
          maxLength={TITLE_MAX}
          isInvalid={touched && Boolean(titleError)}
          onChange={(e) => setTitle(e.target.value)}
        />
        {touched && titleError ? <ErrorMessage>{titleError}</ErrorMessage> : null}
      </Stack>

      <Stack space="space.050">
        <Label labelFor="goal">Goal</Label>
        <TextArea id="goal" name="goal" value={goal} minimumRows={6} onChange={(e) => setGoal(e.target.value)} />
        <HelperMessage>Markdown. Taken from the issue description, with a link back to the issue.</HelperMessage>
      </Stack>

      <Stack space="space.050">
        <Label labelFor="targets">Target repositories</Label>
        <Select
          inputId="targets"
          isMulti
          options={repos.map(repoOption)}
          value={targets}
          isInvalid={touched && Boolean(targetError)}
          onChange={(value: Option[] | null) => setTargets(value ?? [])}
          placeholder="Repositories the initiative will change"
        />
        {touched && targetError ? <ErrorMessage>{targetError}</ErrorMessage> : null}
      </Stack>

      <Stack space="space.050">
        <Label labelFor="context">Context repositories (optional)</Label>
        <Select
          inputId="context"
          isMulti
          options={contextOptions}
          value={context.filter((c) => !targetIds.includes(c.value))}
          onChange={(value: Option[] | null) => setContext(value ?? [])}
          placeholder="Repositories Velx should read for context"
        />
      </Stack>

      {error ? (
        <SectionMessage appearance="error" title="Velx did not create the initiative">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      <Inline space="space.100" alignInline="end">
        <Button appearance="subtle" onClick={() => view.close()}>
          Cancel
        </Button>
        <LoadingButton
          appearance="primary"
          isLoading={busy}
          isDisabled={Boolean(linked) && !replaceLink}
          onClick={create}
        >
          Create initiative
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
