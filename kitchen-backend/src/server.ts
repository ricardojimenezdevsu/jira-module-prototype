/**
 * Starts the kitchen backend: `bun start` (or `bun run dev` to restart on changes).
 * Bun loads `.env` automatically.
 */
import { createApp } from './app.ts';
import { verifyFit } from './fit.ts';
import { fetchIssue } from './jira.ts';

const appId = process.env.FORGE_APP_ID;
if (!appId) {
  console.error('FORGE_APP_ID is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
createApp({ appId, verifyFit, fetchIssue }).listen(port, () => {
  console.log(`Kitchen backend listening on http://localhost:${port} for app ${appId}`);
});
