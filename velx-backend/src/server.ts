/**
 * Starts the Velx connector stub: `bun start` (or `bun run dev` to restart on changes).
 * Bun loads `.env` automatically.
 */
import { createApp } from './app.ts';
import { verifyFit } from './fit.ts';
import { deleteIssueProperty, fetchIssue, getIssueProperty, setIssueProperty } from './jira.ts';
import { createJiraPropertyLinkStore, createMemoryLinkStore } from './linkStore.ts';
import { StubVelxClient } from './velx/stub.ts';

const appId = process.env.FORGE_APP_ID;
if (!appId) {
  console.error('FORGE_APP_ID is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const velxWebUrl = process.env.VELX_WEB_URL ?? 'https://demo.velx.example';
const velxUsername = process.env.VELX_STUB_USERNAME ?? 'demo.user';
const simulation = process.env.VELX_SIMULATION !== 'false';
const linkStoreKind = process.env.LINK_STORE ?? 'jira-property';
if (linkStoreKind !== 'jira-property' && linkStoreKind !== 'memory') {
  console.error(`LINK_STORE must be "jira-property" or "memory", not "${linkStoreKind}".`);
  process.exit(1);
}

const linkStore =
  linkStoreKind === 'memory'
    ? createMemoryLinkStore()
    : createJiraPropertyLinkStore({ getIssueProperty, setIssueProperty, deleteIssueProperty, logger: console });

createApp({
  appId,
  verifyFit,
  fetchIssue,
  linkStore,
  velx: new StubVelxClient(),
  velxWebUrl,
  velxUsername,
  simulation,
}).listen(port, () => {
  console.log(`Velx connector stub listening on http://localhost:${port} for app ${appId}`);
  console.log(
    `  links: ${linkStore.kind}, simulation: ${simulation ? 'on' : 'off'}, ` +
      `Velx web: ${velxWebUrl}, acting as Velx user: ${velxUsername}`
  );
});
