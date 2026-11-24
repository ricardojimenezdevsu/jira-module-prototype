/**
 * Starts the kitchen backend: `npm start` (or `npm run dev` to restart on changes).
 */
import { createApp } from './app.js';
import { verifyFit } from './fit.js';
import { fetchIssue } from './jira.js';

const appId = process.env.FORGE_APP_ID;
if (!appId) {
  console.error('FORGE_APP_ID is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
createApp({ appId, verifyFit, fetchIssue }).listen(port, () => {
  console.log(`Kitchen backend listening on http://localhost:${port} for app ${appId}`);
});
