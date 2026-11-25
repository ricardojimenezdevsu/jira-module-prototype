/**
 * The kitchen: a stand-in for a real product backend.
 *
 * Every /kitchen route requires a valid Forge Invocation Token. The site, user and issue
 * the request is about are taken ONLY from the verified token, never from the request
 * body, so a user cannot act on another site or issue by editing the request.
 *
 * Data is kept in memory and lost on restart. That is fine for a throwaway prototype.
 */
import express, { type ErrorRequestHandler, type Express } from 'express';
import type { AppDeps, FitClaims, ForgeRequestContext, IssueRecord, Ticket } from './types.ts';

export const STAGES = ['Received', 'Cooking', 'Plated', 'Served'] as const;

/** Builds the Express app. Dependencies are injected so tests can replace them. */
export function createApp({ appId, verifyFit, fetchIssue, logger = console }: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // In-memory store: tenant (installation) -> issue key -> { ticket, log }.
  // In a real product, "tenant" would come from mapping the installation to a
  // tenant of that product, which is out of scope for this prototype.
  const tenants = new Map<string, Map<string, IssueRecord>>();
  let nextOrderNo = 1;

  const recordFor = (forge: ForgeRequestContext): IssueRecord => {
    // The auth middleware guarantees issueKey; installationId always comes with a valid FIT.
    const installationId = forge.installationId ?? '';
    const issueKey = forge.issueKey ?? '';
    let issues = tenants.get(installationId);
    if (!issues) {
      issues = new Map();
      tenants.set(installationId, issues);
    }
    let record = issues.get(issueKey);
    if (!record) {
      record = { ticket: null, log: [] };
      issues.set(issueKey, record);
    }
    return record;
  };

  const addLog = (record: IssueRecord, accountId: string | undefined, text: string) => {
    record.log.push({ at: new Date().toISOString(), accountId, text });
  };

  // Unauthenticated health check, handy for checking the tunnel from a browser.
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- Forge authentication for everything under /kitchen ----
  app.use('/kitchen', async (req, res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '');
    if (!match) {
      res.status(401).json({ error: 'Missing Forge Invocation Token' });
      return;
    }

    let fit: FitClaims;
    try {
      fit = await verifyFit(match[1], appId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[forge] rejected ${req.method} ${req.originalUrl}: ${message}`);
      // 401 tells Forge the token could not be verified.
      res.status(401).json({ error: 'Invalid Forge Invocation Token' });
      return;
    }

    const issue = fit.context?.extension?.issue;
    req.forge = {
      installationId: fit.app?.installationId,
      environment: fit.app?.environment?.type,
      apiBaseUrl: fit.app?.apiBaseUrl,
      cloudId: fit.context?.cloudId,
      siteUrl: fit.context?.siteUrl,
      moduleKey: fit.context?.moduleKey,
      accountId: fit.principal,
      issueKey: issue?.key,
      issueId: issue?.id,
      // OAuth tokens are opaque and must never be logged.
      userToken: req.get('x-forge-oauth-user'),
    };

    // What this prototype proves: the site, the user and the issue.
    const f = req.forge;
    logger.log(
      `[forge] ${req.method} ${req.originalUrl} site=${f.siteUrl} cloudId=${f.cloudId} ` +
        `installation=${f.installationId} env=${f.environment} module=${f.moduleKey} ` +
        `user=${f.accountId} issue=${f.issueKey} userToken=${f.userToken ? 'present' : 'absent'}`
    );

    if (!f.issueKey) {
      res.status(400).json({ error: 'This request did not come from an issue view module' });
      return;
    }
    next();
  });

  // ---- Send to kitchen (Issue Action) ----
  app.post('/kitchen/orders', async (req, res) => {
    const f = req.forge;
    const issueKey = f.issueKey as string; // checked by the auth middleware
    if (!f.userToken) {
      res.status(403).json({ error: 'No user token: check endpoint.auth.appUserToken in the manifest' });
      return;
    }

    // Read the issue from Jira on the server, as the user (pattern A).
    const issue = await fetchIssue({
      apiBaseUrl: f.apiBaseUrl ?? '',
      userToken: f.userToken,
      issueKey,
    });
    const { fields } = issue;
    logger.log(
      `[jira] read ${issueKey}: summary="${fields.summary}" status=${fields.status?.name} ` +
        `priority=${fields.priority?.name} labels=[${(fields.labels ?? []).join(', ')}]`
    );

    const rush = ['Highest', 'High'].includes(fields.priority?.name ?? '');
    const body: unknown = req.body;
    const rawNotes = typeof body === 'object' && body !== null ? (body as { notes?: unknown }).notes : undefined;
    const notes = typeof rawNotes === 'string' ? rawNotes.trim().slice(0, 500) : '';
    const ticket: Ticket = {
      orderNo: nextOrderNo++,
      issueKey,
      table: issueKey.split('-').pop() ?? issueKey,
      dish: fields.summary,
      course: fields.issuetype?.name ?? 'Main',
      dietary: fields.labels ?? [],
      rush,
      prepMinutes: rush ? 10 : 20,
      notes,
      jiraStatus: fields.status?.name ?? 'Unknown',
      stages: STAGES,
      stageIndex: 0,
      orderedBy: f.accountId,
      orderedAt: new Date().toISOString(),
    };

    const record = recordFor(f);
    record.ticket = ticket;
    addLog(record, f.accountId, `Order #${ticket.orderNo} sent to the kitchen${rush ? ' (rush)' : ''}`);
    res.status(201).json({ ticket });
  });

  // ---- Kitchen ticket (Issue Panel) ----
  app.get('/kitchen/ticket', (req, res) => {
    res.json({ ticket: recordFor(req.forge).ticket });
  });

  app.post('/kitchen/ticket/advance', (req, res) => {
    const record = recordFor(req.forge);
    const { ticket } = record;
    if (!ticket) {
      res.status(404).json({ error: 'No order for this issue yet' });
      return;
    }
    if (ticket.stageIndex >= STAGES.length - 1) {
      res.status(409).json({ error: 'This order was already served' });
      return;
    }
    ticket.stageIndex += 1;
    addLog(record, req.forge.accountId, `Order #${ticket.orderNo} is now ${STAGES[ticket.stageIndex]}`);
    res.json({ ticket });
  });

  // ---- Kitchen log (Issue Activity) ----
  app.get('/kitchen/log', (req, res) => {
    const entries = [...recordFor(req.forge).log].reverse(); // newest first
    res.json({ entries });
  });

  // Errors always go back as JSON (invokeRemote needs a JSON body on non-2xx), never as 401.
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const err = error as Error & { status?: number };
    const status = err.status && err.status !== 401 ? err.status : 500;
    logger.error(`[kitchen] ${status}: ${err.message}`);
    res.status(status).json({ error: status === 500 ? 'The kitchen had a problem' : err.message });
  };
  app.use(errorHandler);

  return app;
}
