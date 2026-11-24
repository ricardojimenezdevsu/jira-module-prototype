/**
 * Issue Panel: "Kitchen ticket" (Custom UI).
 *
 * Plain React + CSS in a sandboxed iframe, built with Vite. Compared with the UI Kit
 * modules, we control every pixel (here: a paper order ticket) but have to handle
 * theming and layout ourselves.
 *
 * Talks to the kitchen backend with invokeRemote, exactly like the UI Kit modules.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { invokeRemote } from '@forge/bridge';

/** Calls the kitchen and turns any non-2xx answer into an Error. */
async function callKitchen(path, method = 'GET') {
  const res = await invokeRemote({ path, method });
  if (res.status >= 300) throw new Error(res.body?.error ?? `Kitchen answered ${res.status}`);
  return res.body;
}

export default function App() {
  // ticket: undefined while loading, null when the issue has no order yet.
  const [ticket, setTicket] = useState(undefined);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await callKitchen('/kitchen/ticket');
      setTicket(body.ticket);
      setError(null);
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="message error">
        <strong>The kitchen is not answering.</strong> {error}
        <button type="button" className="link" onClick={load}>Try again</button>
      </div>
    );
  }
  if (ticket === undefined) return <p className="muted">Fetching the ticket…</p>;
  if (ticket === null) {
    return (
      <div className="message">
        No ticket yet. Use <strong>Send to kitchen</strong> in the issue's ••• menu.
        <button type="button" className="link" onClick={load}>Refresh</button>
      </div>
    );
  }

  const isServed = ticket.stageIndex === ticket.stages.length - 1;

  return (
    <article className="ticket" aria-label={`Kitchen ticket ${ticket.orderNo}`}>
      <header className="ticket-head">
        <span>Order #{ticket.orderNo}</span>
        <span>Table {ticket.table}</span>
      </header>

      <h2 className="dish">{ticket.dish}</h2>
      <div className="tags">
        {ticket.rush && <span className="tag rush">Rush</span>}
        {ticket.dietary.map((label) => (
          <span key={label} className="tag">{label}</span>
        ))}
        <span className="tag muted-tag">~{ticket.prepMinutes} min</span>
      </div>

      {ticket.notes && <p className="notes">“{ticket.notes}”</p>}

      <ol className="stages">
        {ticket.stages.map((stage, index) => (
          <li
            key={stage}
            className={index < ticket.stageIndex ? 'done' : index === ticket.stageIndex ? 'current' : ''}
          >
            {stage}
          </li>
        ))}
      </ol>

      <footer className="ticket-foot">
        <span className="muted">Jira status when ordered: {ticket.jiraStatus}</span>
        <button type="button" className="primary" onClick={advance} disabled={busy || isServed}>
          {isServed ? 'Served' : busy ? 'Moving…' : `Mark as ${ticket.stages[ticket.stageIndex + 1]}`}
        </button>
      </footer>
    </article>
  );
}
