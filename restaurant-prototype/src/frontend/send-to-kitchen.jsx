/**
 * Issue Action: "Send to kitchen" (UI Kit).
 *
 * Opens as a modal from the issue's ••• menu. It sends ONLY the chef notes to the
 * kitchen backend. The backend works out which site, user and issue the order is for
 * from the signed Forge Invocation Token (FIT), and reads the issue details from Jira
 * itself with the user's token. This way the browser
 * never sends issue data the backend has to trust.
 */
import React, { useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  Inline,
  Label,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  TextArea,
  useProductContext,
} from '@forge/react';
import { invokeRemote, view } from '@forge/bridge';

const App = () => {
  // Product context tells us which issue the modal was opened on (display only).
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;

  const [notes, setNotes] = useState('');
  // status: idle | sending | sent | error
  const [state, setState] = useState({ status: 'idle' });

  const sendOrder = async () => {
    setState({ status: 'sending' });
    try {
      // invokeRemote is proxied by Forge: it adds the FIT and the user token headers.
      const res = await invokeRemote({
        path: '/kitchen/orders',
        method: 'POST',
        body: { notes },
      });
      // Non-2xx responses with a JSON body resolve (they do not throw), so check the status.
      if (res.status >= 300) {
        setState({ status: 'error', message: res.body?.error ?? `Kitchen answered ${res.status}` });
        return;
      }
      setState({ status: 'sent', ticket: res.body.ticket });
    } catch (error) {
      // Thrown for network errors, timeouts, or a 401 (token verification failed).
      setState({ status: 'error', message: error.message });
    }
  };

  if (state.status === 'sent') {
    const { ticket } = state;
    return (
      <Stack space="space.200">
        <SectionMessage appearance="success" title={`Order #${ticket.orderNo} is in the kitchen`}>
          <Text>
            The chef is preparing "{ticket.dish}". Open the Kitchen ticket panel to follow it.
          </Text>
        </SectionMessage>
        <Inline space="space.100">
          {ticket.rush ? <Lozenge appearance="removed">Rush</Lozenge> : null}
          <Lozenge appearance="inprogress">{ticket.stages[ticket.stageIndex]}</Lozenge>
          <Text>About {ticket.prepMinutes} minutes</Text>
        </Inline>
        <Inline alignInline="end">
          <Button appearance="primary" onClick={() => view.close()}>
            Done
          </Button>
        </Inline>
      </Stack>
    );
  }

  return (
    <Stack space="space.200">
      <Heading size="small">Send {issueKey ?? 'this issue'} to the kitchen</Heading>
      <Text>
        The kitchen reads the dish (summary), priority and dietary labels straight from Jira.
        You only add notes for the chef.
      </Text>
      <Stack space="space.050">
        <Label labelFor="chef-notes">Notes for the chef</Label>
        <TextArea
          id="chef-notes"
          name="chef-notes"
          placeholder="No onions, extra sauce on the side..."
          value={notes}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Stack>
      {state.status === 'error' ? (
        <SectionMessage appearance="error" title="The kitchen did not take the order">
          <Text>{state.message}</Text>
        </SectionMessage>
      ) : null}
      <Inline space="space.100" alignInline="end">
        <Button appearance="subtle" onClick={() => view.close()}>
          Cancel
        </Button>
        <Button
          appearance="primary"
          isDisabled={state.status === 'sending'}
          onClick={sendOrder}
        >
          {state.status === 'sending' ? 'Sending…' : 'Send order'}
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
