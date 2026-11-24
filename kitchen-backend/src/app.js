/**
 * The kitchen: a stand-in for a real product backend.
 *
 * Every /kitchen route requires a valid Forge Invocation Token. The site, user and issue
 * the request is about are taken ONLY from the verified token, never from the request
 * body, so a user cannot act on another site or issue by editing the request.
 *
 * Data is kept in memory and lost on restart. That is fine for a throwaway prototype.
 */
import express from 'express';

export const STAGES = ['Received', 'Cooking', 'Plated', 'Served'];

/**
 * Builds the Express app. Dependencies are injected so tests can replace the token
 * check and the Jira call.
 * @param {object} deps
 * @param {string} deps.appId Our Forge app ID.
 * @param {(token: string, appId: string) => Promise<object>} deps.verifyFit
 * @param {(args: {apiBaseUrl: string, userToken: string, issueKey: string}) => Promise<object>} deps.fetchIssue
 * @param {Pick<Console, 'log' | 'warn' | 'error'>} [deps.logger]
 */
export function createApp({ appId, verifyFit, fetchIssue, logger = console }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // In-memory store: tenant (installation) -> issue key -> { ticket, log }.
  // In a real product, "tenant" would come from mapping the installation to a
  // tenant of that product, which is out of scope for this prototype.
  const tenants = new Map();
  let nextOrderNo = 1;

  const recordFor = (forge) => {
    if (!tenants.has(forge.installationId)) tenants.set(forge.installationId, new Map());
    const issues = tenants.get(forge.installationId);
    if (!issues.has(forge.issueKey)) issues.set(forge.issueKey, { ticket: null, log: [] });
    return issues.get(forge.issueKey);
  };

  const addLog = (record, accountId, text) => {
    record.log.push({ at: new Date().toISOString(), accountId, text });
  };

  // Unauthenticated health check, handy for checking the tunnel from a browser.
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---- Forge authentication for everything under /kitchen ----
  app.use('/kitchen', async (req, res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '');
    if (!match) {
      return res.status(401).json({ error: 'Missing Forge Invocation Token' });
    }

    let fit;
    try {
      fit = await verifyFit(match[1], appId);
    } catch (error) {
      logger.warn(`[forge] rejected ${req.method} ${req.originalUrl}: ${error.message}`);
      // 401 tells Forge the token could not be verified.
      return res.status(401).json({ error: 'Invalid Forge Invocation Token' });
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
      return res.status(400).json({ error: 'This request did not come from an issue view module' });
    }
    next();
  });

  // ---- Send to kitchen (Issue Action) ----
  app.post('/kitchen/orders', async (req, res) => {
    const f = req.forge;
    if (!f.userToken) {
      return res.status(403).json({ error: 'No user token: check endpoint.auth.appUserToken in the manifest' });
    }

    // Read the issue from Jira on the server, as the user (pattern A).
    const issue = await fetchIssue({
      apiBaseUrl: f.apiBaseUrl,
      userToken: f.userToken,
      issueKey: f.issueKey,
    });
    const { fields } = issue;
    logger.log(
      `[jira] read ${f.issueKey}: summary="${fields.summary}" status=${fields.status?.name} ` +
        `priority=${fields.priority?.name} labels=[${(fields.labels ?? []).join(', ')}]`
    );

    const rush = ['Highest', 'High'].includes(fields.priority?.name);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '';
    const ticket = {
      orderNo: nextOrderNo++,
      issueKey: f.issueKey,
      table: f.issueKey.split('-').pop(),
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
    if (!ticket) return res.status(404).json({ error: 'No order for this issue yet' });
    if (ticket.stageIndex >= STAGES.length - 1) {
      return res.status(409).json({ error: 'This order was already served' });
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
  app.use((error, _req, res, _next) => {
    const status = error.status && error.status !== 401 ? error.status : 500;
    logger.error(`[kitchen] ${status}: ${error.message}`);
    res.status(status).json({ error: status === 500 ? 'The kitchen had a problem' : error.message });
  });

  return app;
}
