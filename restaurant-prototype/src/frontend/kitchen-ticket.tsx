/**
 * Issue Panel: "Kitchen ticket" (UI Kit).
 *
 * Shows the ticket the kitchen backend keeps for this issue and lets the user move it
 * to the next stage. The backend picks the issue from the signed token, so neither
 * request carries any parameters.
 */
import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  Inline,
  LoadingButton,
  Lozenge,
  ProgressTracker,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { invokeRemote } from '@forge/bridge';
import { errorMessage, type KitchenError, type Ticket } from './types';

/** GET /kitchen/ticket and POST /kitchen/ticket/advance both answer with this. */
interface TicketResponse {
  ticket: Ticket | null;
}

/** Calls the kitchen and turns any non-2xx answer into an Error. */
async function callKitchen(path: string, method: 'GET' | 'POST' = 'GET'): Promise<TicketResponse> {
  const res = await invokeRemote({ path, method });
  if (res.status >= 300) {
    const body = res.body as KitchenError | undefined;
    throw new Error(body?.error ?? `Kitchen answered ${res.status}`);
  }
  return res.body as TicketResponse;
}

/** Turns the ticket's stages into ProgressTracker steps. */
const stageItems = (ticket: Ticket) =>
  ticket.stages.map((stage, index) => {
    const done = index < ticket.stageIndex;
    const current = index === ticket.stageIndex;
    return {
      id: stage,
      label: stage,
      percentageComplete: done ? 100 : 0,
      status: done ? ('visited' as const) : current ? ('current' as const) : ('unvisited' as const),
    };
  });

const App = () => {
  // ticket: undefined while loading, null when the issue has no order yet.
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await callKitchen('/kitchen/ticket');
      setTicket(body.ticket);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async () => {
    setBusy(true);
    try {
      const body = await callKitchen('/kitchen/ticket/advance', 'POST');
      setTicket(body.ticket);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <SectionMessage appearance="warning" title="The kitchen is not answering">
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
  if (ticket === undefined) return <Spinner label="Fetching the ticket" />;
  if (ticket === null) {
    return (
      <SectionMessage appearance="information" title="No ticket yet">
        <Stack space="space.100">
          <Text>Use "Send to kitchen" in the issue's ••• menu.</Text>
          <Inline>
            <Button appearance="subtle" onClick={load}>
              Refresh
            </Button>
          </Inline>
        </Stack>
      </SectionMessage>
    );
  }

  const isServed = ticket.stageIndex === ticket.stages.length - 1;
  const buttonLabel = isServed ? 'Served' : `Mark as ${ticket.stages[ticket.stageIndex + 1]}`;

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        <Text weight="bold">Order #{ticket.orderNo}</Text>
        <Text weight="bold">Table {ticket.table}</Text>
      </Inline>

      <Heading size="medium">{ticket.dish}</Heading>

      <Inline space="space.075" shouldWrap>
        {ticket.rush && <Lozenge appearance="removed" isBold>Rush</Lozenge>}
        {ticket.dietary.map((label) => (
          <Lozenge key={label} appearance="success">{label}</Lozenge>
        ))}
        <Lozenge>{`~${ticket.prepMinutes} min`}</Lozenge>
      </Inline>

      {ticket.notes && <Text as="em">“{ticket.notes}”</Text>}

      <ProgressTracker label="Kitchen progress" items={stageItems(ticket)} spacing="compact" />

      <Inline spread="space-between" alignBlock="center">
        <Text color="color.text.subtlest" size="small">
          Jira status when ordered: {ticket.jiraStatus}
        </Text>
        <LoadingButton appearance="primary" onClick={advance} isLoading={busy} isDisabled={isServed}>
          {buttonLabel}
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
