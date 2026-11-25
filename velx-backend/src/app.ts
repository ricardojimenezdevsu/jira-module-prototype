/**
 * The Velx Jira connector (stub): what the Forge modules call through Forge Remote.
 *
 * A Forge remote has one base URL per app, so it cannot point at each customer's Velx
 * deployment. A connector in front of the deployments is the realistic shape; this one maps
 * every site to a stub Velx (see tenancy.ts) and talks to it through VelxClient.
 *
 *   /velx/*  Velx data the modules need (initiatives, repositories). Velx response shapes.
 *   /jira/*  The link between this issue and an initiative, creating initiatives from the
 *            issue, the activity tab, and (stub only) simulated progress.
 *
 * Every route except /health requires a valid Forge Invocation Token. The site, user and
 * issue are taken ONLY from the verified token, never from the request body, so a user
 * cannot act on another site or issue by editing the request.
 */
import express, { type ErrorRequestHandler, type Express, type Request } from 'express';
import { adfToMarkdown } from './adf.ts';
import { HttpError } from './errors.ts';
import { INVALID_LINK, isUuid, type IssueLink, type LinkTarget } from './linkStore.ts';
import { createStubTenancy, type VelxTenant } from './tenancy.ts';
import type { ActivityEntry, AppDeps, FitClaims, ForgeRequestContext, JiraIssue } from './types.ts';
import { TITLE_MAX } from './velx/stub.ts';
import type { InitiativeDetail } from './velx/types.ts';

/** Builds the Express app. Dependencies are injected so tests can replace them. */
export function createApp({
  appId,
  verifyFit,
  fetchIssue,
  linkStore,
  velx,
  velxWebUrl,
  velxUsername,
  simulation,
  logger = console,
}: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const tenancy = createStubTenancy({ webUrl: velxWebUrl, username: velxUsername, logger });
  const tenants = new WeakMap<Request, VelxTenant>();

  // What the connector did for each issue (linked, created, unlinked), keyed by site and issue.
  // Kept in memory: it is lost on restart, like everything in the stub.
  const events = new Map<string, ActivityEntry[]>();
  const issueId = (f: ForgeRequestContext) => `${f.cloudId}:${f.issueId ?? f.issueKey}`;
  const addEvent = (f: ForgeRequestContext, text: string) => {
    const list = events.get(issueId(f)) ?? [];
    list.push({ at: new Date().toISOString(), source: 'jira', accountId: f.accountId, text });
    events.set(issueId(f), list);
  };

  const initiativeUrl = (tenant: VelxTenant, initiativeId: string) =>
    `${tenant.webUrl.replace(/\/+$/, '')}/initiatives/${initiativeId}`;

  /** Calls that read or change Jira need the user's token. 403, never 401 (reserved by Forge). */
  const target = (f: ForgeRequestContext): LinkTarget => {
    if (!f.userToken) {
      throw new HttpError(403, 'No user token: check endpoint.auth.appUserToken in the manifest');
    }
    return {
      apiBaseUrl: f.apiBaseUrl ?? '',
      userToken: f.userToken,
      cloudId: f.cloudId ?? '',
      issueId: f.issueId ?? '',
      issueKey: f.issueKey ?? '',
    };
  };

  /** Reads the issue as the user and logs what was read. */
  const readIssue = async (f: ForgeRequestContext): Promise<JiraIssue> => {
    const t = target(f);
    const issue = await fetchIssue({ apiBaseUrl: t.apiBaseUrl, userToken: t.userToken, issueKey: t.issueKey });
    logger.log(`[jira] read ${t.issueKey}: summary="${issue.fields.summary}" status=${issue.fields.status?.name}`);
    return issue;
  };

  /** Title and goal for a new initiative, from the issue. */
  const draftFrom = (f: ForgeRequestContext, issue: JiraIssue) => {
    const key = f.issueKey ?? '';
    const description = adfToMarkdown(issue.fields.description);
    const source = `Source: Jira issue ${key} (${(f.siteUrl ?? '').replace(/\/+$/, '')}/browse/${key})`;
    return {
      title: issue.fields.summary.trim().slice(0, TITLE_MAX),
      initiativeGoal: description ? `${description}\n\n---\n${source}` : source,
    };
  };

  const getInitiative = async (initiativeId: string): Promise<InitiativeDetail | null> =>
    (await velx.getInitiative(initiativeId))?.data.initiative ?? null;

  // Unauthenticated health check, handy for checking the tunnel from a browser.
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- Forge authentication for everything else ----
  app.use(['/velx', '/jira'], async (req, res, next) => {
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
    const f = req.forge;
    const tenant = tenancy.resolve(f);
    tenants.set(req, tenant);

    logger.log(
      `[forge] ${req.method} ${req.originalUrl} site=${f.siteUrl} cloudId=${f.cloudId} ` +
        `installation=${f.installationId} env=${f.environment} module=${f.moduleKey} ` +
        `user=${f.accountId} issue=${f.issueKey} userToken=${f.userToken ? 'present' : 'absent'} ` +
        `velxUser=${tenant.username}`
    );

    if (!f.issueKey) {
      res.status(400).json({ error: 'This request did not come from an issue view module' });
      return;
    }
    next();
  });

  const tenantOf = (req: Request): VelxTenant => tenants.get(req) ?? { webUrl: velxWebUrl, username: velxUsername };

  // ---- Velx data ----
  app.get('/velx/initiatives', async (_req, res) => {
    res.json(await velx.listInitiatives());
  });

  app.get('/velx/datasources', async (_req, res) => {
    res.json(await velx.listDatasources());
  });

  // ---- The link (all modules) ----
  app.get('/jira/link', async (req, res) => {
    const link = await linkStore.get(target(req.forge));
    if (link === null) {
      res.json({ link: null, initiative: null, velxUrl: null });
      return;
    }
    if (link === INVALID_LINK) {
      res.json({ link: null, initiative: null, velxUrl: null, problem: 'invalid-link' });
      return;
    }
    const initiative = await getInitiative(link.initiativeId);
    res.json({
      link,
      initiative,
      velxUrl: initiativeUrl(tenantOf(req), link.initiativeId),
      ...(initiative ? {} : { problem: 'not-found' }),
    });
  });

  app.put('/jira/link', async (req, res) => {
    const f = req.forge;
    const t = target(f);
    const initiativeId: unknown = (req.body as { initiativeId?: unknown } | undefined)?.initiativeId;
    if (!isUuid(initiativeId)) throw new HttpError(400, 'initiativeId must be a Velx initiative id');
    const initiative = await getInitiative(initiativeId);
    if (!initiative) throw new HttpError(404, 'Initiative not found in Velx');
    if (initiative.archiveStatus.state === 'archived') throw new HttpError(409, 'This initiative is archived');

    const previous = await linkStore.get(t);
    const link: IssueLink = { v: 1, initiativeId, linkedAt: new Date().toISOString() };
    await linkStore.set(t, link);
    const replaced = previous && previous !== INVALID_LINK && previous.initiativeId !== initiativeId;
    addEvent(f, `Linked to "${initiative.title}"${replaced ? ' (replaced the previous link)' : ''}`);
    res.json({ link, initiative, velxUrl: initiativeUrl(tenantOf(req), initiativeId) });
  });

  app.delete('/jira/link', async (req, res) => {
    const f = req.forge;
    const t = target(f);
    const previous = await linkStore.get(t);
    await linkStore.delete(t);
    if (previous && previous !== INVALID_LINK) {
      const initiative = await getInitiative(previous.initiativeId);
      addEvent(f, `Unlinked from "${initiative?.title ?? previous.initiativeId}"`);
    }
    // JSON, not 204: invokeRemote expects a body.
    res.json({ link: null });
  });

  // ---- Create Velx initiative (Issue Action) ----
  app.get('/jira/draft', async (req, res) => {
    const f = req.forge;
    const issue = await readIssue(f);
    res.json({
      ...draftFrom(f, issue),
      issue: { key: f.issueKey, summary: issue.fields.summary, status: issue.fields.status?.name ?? null },
    });
  });

  app.post('/jira/initiatives', async (req, res) => {
    const f = req.forge;
    const t = target(f);
    const body: Record<string, unknown> =
      typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const stringList = (name: string, value: unknown): string[] | undefined => {
      if (value === undefined) return undefined;
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new HttpError(400, `${name} must be a list of repository ids`);
      }
      return value;
    };
    const optionalString = (name: string, value: unknown): string | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string') throw new HttpError(400, `${name} must be text`);
      return value;
    };
    const targetDatasourceIds = stringList('targetDatasourceIds', body.targetDatasourceIds) ?? [];
    const contextDatasourceIds = stringList('contextDatasourceIds', body.contextDatasourceIds);
    const standardIds = stringList('standardIds', body.standardIds);
    const title = optionalString('title', body.title);
    const initiativeGoal = optionalString('initiativeGoal', body.initiativeGoal);

    const previous = await linkStore.get(t);
    const linked = previous && previous !== INVALID_LINK ? previous : null;
    if (linked && body.replaceLink !== true) {
      res.status(409).json({ error: 'This issue is already linked to a Velx initiative', code: 'already-linked' });
      return;
    }

    // Read the issue as the user: proves they can see it and fills anything left empty.
    const draft = draftFrom(f, await readIssue(f));
    const tenant = tenantOf(req);
    const created = await velx.createInitiative(
      {
        title: title?.trim() ? title : draft.title,
        initiativeGoal: initiativeGoal?.trim() ? initiativeGoal : draft.initiativeGoal,
        targetDatasourceIds,
        contextDatasourceIds,
        standardIds,
      },
      { username: tenant.username }
    );
    const initiative = created.data.initiative;
    const link: IssueLink = { v: 1, initiativeId: initiative.initiativeId, linkedAt: new Date().toISOString() };
    await linkStore.set(t, link);
    addEvent(
      f,
      `Created "${initiative.title}" in Velx and linked it${linked ? ' (replaced the previous link)' : ''}`
    );
    res.status(201).json({ link, initiative, velxUrl: initiativeUrl(tenant, initiative.initiativeId) });
  });

  // ---- Velx journal (Issue Activity) ----
  app.get('/jira/journal', async (req, res) => {
    const f = req.forge;
    const link = await linkStore.get(target(f));
    const entries: ActivityEntry[] = [...(events.get(issueId(f)) ?? [])];
    if (link && link !== INVALID_LINK && (await getInitiative(link.initiativeId))) {
      const { data } = await velx.listJournalEntries(link.initiativeId);
      for (const e of data) {
        entries.push({
          at: e.createdAt,
          source: e.source,
          tag: e.tag,
          step: e.step,
          velxUsername: e.authorUsername,
          text: e.content,
        });
      }
    }
    entries.sort((a, b) => b.at.localeCompare(a.at)); // newest first
    res.json({ entries });
  });

  // ---- Simulated progress (stub only) ----
  const simulate = (move: 'simulateAdvance' | 'simulateFail') =>
    async function handler(req: Request, res: express.Response) {
      if (!simulation) throw new HttpError(404, 'Simulation is turned off');
      const link = await linkStore.get(target(req.forge));
      if (!link || link === INVALID_LINK) throw new HttpError(404, 'This issue is not linked to a Velx initiative');
      const result = await velx[move](link.initiativeId, { username: tenantOf(req).username });
      res.json({ initiative: result.data.initiative });
    };
  app.post('/jira/simulate/advance', simulate('simulateAdvance'));
  app.post('/jira/simulate/fail', simulate('simulateFail'));

  // Errors always go back as JSON (invokeRemote needs a JSON body on non-2xx), never as 401.
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const err = error as Error & { status?: number };
    const status = err.status && err.status !== 401 ? err.status : 500;
    logger.error(`[velx] ${status}: ${err.message}`);
    res.status(status).json({ error: status === 500 ? 'The Velx connector had a problem' : err.message });
  };
  app.use(errorHandler);

  return app;
}
