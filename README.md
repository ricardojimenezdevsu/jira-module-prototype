# Jira modules prototype: Velx initiatives

Throwaway Forge app that links Jira issues to **Velx (app-scanner) initiatives**. From an issue
you can link an existing initiative or create a new one from the issue, then follow its status,
its steps and its journal without leaving Jira. Everything is written in TypeScript.

The backend is a **stub of Velx**: it mirrors Velx's initiative shapes, statuses and steps, but
keeps data in memory and does not call a real Velx. Real Velx authentication and tenant mapping
belong to issue #3755.

| Folder | What it is |
| --- | --- |
| `velx-jira-app/` | The Forge app (registered as `restaurant-prototype` in the `dev` Developer Space; the id did not change) |
| `velx-backend/` | The Velx connector stub reached through Forge Remote (Bun + Express) |

## The five modules

| Module | Name in Jira | Shown when | Connector routes |
| --- | --- | --- | --- |
| `jira:issueAction` | Link to Velx initiative (••• menu) | The user can edit the issue | `GET /jira/link`, `GET /velx/initiatives`, `PUT /jira/link`, `DELETE /jira/link` |
| `jira:issueAction` | Create Velx initiative (••• menu) | The user can edit the issue | `GET /jira/draft`, `GET /jira/link`, `GET /velx/datasources`, `POST /jira/initiatives` |
| `jira:issueContext` | Velx initiative (right sidebar) | The issue is linked | `GET /jira/link` |
| `jira:issuePanel` | Velx initiative (panel button) | The issue is linked | `GET /jira/link`, `POST /jira/simulate/advance`, `POST /jira/simulate/fail` |
| `jira:issueActivity` | Velx journal (Activity tab) | The issue is linked | `GET /jira/journal` |

All five are UI Kit. They use Forge [manual packaging](https://developer.atlassian.com/platform/forge/manifest-reference/packaging/)
(preview): Forge does not compile or bundle them. Each module has an HTML entry in
`velx-jira-app/src/frontend/` (for example `velx-journal.html`) that loads its `.tsx` file.
`bun run build` bundles these entries into `velx-jira-app/build/`, and that folder is what
`forge deploy` uploads, as one multi-entry resource (`frontend/<entry>` in the manifest).
`src/frontend/velx.ts` holds the shared shapes, Velx's labels and the `callConnector()` helper.

### Velx terms shown in Jira

- **Status:** Planning → Planned → In Implementation → Implemented.
- **Steps:** AS-IS → TO-BE → Implementation Plan → Implementation.
- **Step status:** In progress, Needs your answers, Pending approval, Waiting to start, Implementing,
  Completed, Failed.
- **Repositories** ("datasources" in Velx): targets are changed by the initiative, context
  repositories are only read.

## Where the link lives

The link is the Jira issue property `velx-initiative`, with the value
`{ "v": 1, "initiativeId": "<uuid>", "linkedAt": "<iso date>" }`.

- The connector writes it **with the user's token**, so Jira checks that the user may edit the issue.
  This needs the `write:jira-work` scope.
- The context, panel and activity modules use the display condition `entityPropertyExists` on it,
  so they appear only on linked issues. Display conditions are evaluated on page load, so both
  actions reload the page after a change.
- Anyone who can edit the issue can also change the property through the REST API. The connector
  treats it as untrusted: the id must be a UUID and must exist in Velx.
- Velx has no field for an external link, so nothing is stored on the Velx side.
- `LINK_STORE=memory` keeps links in the connector instead (lost on restart). It is for tests and
  for running without `write:jira-work`.

## How a request flows

1. A module calls `invokeRemote({ path: '/jira/link' })`. It never sends the issue or the user.
2. Forge proxies the call to `VELX_CONNECTOR_URL` and adds a signed Forge Invocation Token (FIT) and
   the user's OAuth token (`x-forge-oauth-user`).
3. The connector verifies the FIT against Atlassian's JWKS (audience = our app ID) and logs the
   site, installation, module, user and issue it names.
4. **Tenant mapping (faked).** It maps the site to a Velx deployment and the Atlassian account to a
   Velx user. Velx runs one deployment per customer and has no link between Atlassian and Velx
   users, so the stub uses one fake deployment and one fake user. It logs, once per site and user,
   the mapping a real connector would need.
5. It reads or writes the issue property and reads the issue with the user's token, then calls
   Velx through the `VelxClient` interface (implemented in memory by `StubVelxClient`).

## Run it

Prerequisites: [Bun](https://bun.sh) 1.2+ for the backend and to build the Forge app, Node 22+
and the Forge CLI logged in (`forge login`) for the Forge app, `cloudflared`, and a Jira Cloud
developer site where you are an admin.

```powershell
# 1. Connector stub (Bun runs the TypeScript directly and loads .env by itself)
cd velx-backend
copy .env.example .env
bun install
bun run typecheck
bun test
bun start                      # http://localhost:3000/health

# 2. Public HTTPS URL for the connector (new terminal). Copy the https://....trycloudflare.com URL.
cloudflared tunnel --url http://localhost:3000

# 3. Forge app (new terminal)
cd velx-jira-app
bun install
bun run typecheck              # tsc on src/frontend
bun run build                  # Bun bundles src/frontend/*.html into build/
$env:VELX_CONNECTOR_URL = "https://<random>.trycloudflare.com"
forge lint
forge deploy -e development    # uploads build/ as-is: always run `bun run build` first
forge install -e development --site <your-site>.atlassian.net --product jira
```

The quick-tunnel URL changes every time cloudflared restarts. When it does, set the new
`VELX_CONNECTOR_URL`, run `forge deploy --approve MAJOR_VERSION_RULE` again, and then
`forge install --upgrade` with the same site, because a new remote URL is a major version.

To iterate on the UI Kit modules without redeploying, run `forge tunnel` (with `VELX_CONNECTOR_URL`
set) while the connector and cloudflared are running. With manual packaging the tunnel serves
`build/`, not the sources, so keep `bun run watch` running next to it to rebuild on save:

```bash
cd velx-jira-app
bun run watch    # terminal 1: rebuilds build/ on every save
forge tunnel     # terminal 2: Jira loads build/ from this machine, for your own requests only
```

Then refresh the issue in Jira to see the change. Watch mode leaves old hashed `.js` files in
`build/`; `bun run build` and `bun run deploy` empty the folder first, so they are not uploaded.
Manifest changes (modules, display conditions, scopes, remotes) still need a deploy.

The frontend `tsconfig.json` lives in `src/frontend/`, not in the app root. With a root
tsconfig, `forge lint` (CLI 15.1) tries to type-lint the bundled `build/*.js` and fails.

### Connector settings (`velx-backend/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `FORGE_APP_ID` | required | Tokens whose audience is not this app are rejected |
| `PORT` | `3000` | Local port |
| `VELX_WEB_URL` | `https://demo.velx.example` | Base of the "Open in Velx" links |
| `VELX_STUB_USERNAME` | `demo.user` | The Velx user every Jira user acts as |
| `VELX_SIMULATION` | `true` | Enables the simulate routes and buttons |
| `LINK_STORE` | `jira-property` | `jira-property` or `memory` |

## What to look at when testing

- **Unlinked issue:** only the two ••• actions appear.
- **Link:** ••• > Link to Velx initiative, pick "Add audit logging to the web portal", Done. After
  the reload the context shows Planning · Step 3 of 4 · Implementation Plan · Pending approval, the
  panel shows the steps, and the Velx journal tab lists the seed entries plus "Linked to …".
- **Create:** on another issue, ••• > Create Velx initiative. Title and goal come from the issue; pick
  a target repository. The new initiative starts at Planning · AS-IS · In progress. Use "Simulate
  progress" and "Simulate failure" in the panel.
- **Already linked:** Create Velx initiative warns and stays disabled until "Replace the link" is ticked.
- **The property:** open `https://<site>/rest/api/3/issue/<KEY>/properties/velx-initiative`.
- **Connector console:**
  - one `[forge]` line per request with site, cloudId, installation, module, user, issue and `velxUser`
  - two `[tenant] … would need …` lines, once per site and user
  - `[jira] read <KEY>` when drafting and creating
  - `[jira] property velx-initiative set on <KEY>` when linking
  - no tokens anywhere
- **Tamper test:** calls without a valid FIT get 401, and a hand-edited property is reported as an
  invalid link (`bun test` covers both).

## What the stub fakes

The real integration still has to solve these (mostly issue #3755):

- **Tenant mapping:** Forge site (cloudId) → the customer's Velx deployment. One Forge remote URL means
  a central connector or gateway in front of the deployments.
- **User mapping and Velx auth:** Atlassian account → Velx user, and a Velx token for that user (Velx's
  OAuth server, which MCP clients already use, is the likely path). Today every Jira user acts as
  `demo.user` and sees every initiative.
- **Velx data:** initiatives, repositories and journals are seeded synthetic data in memory. The
  datasources endpoint and a few field shapes are assumptions, marked `ASSUMED` in
  `velx-backend/src/velx/types.ts`.
- **Progress:** initiatives move only with the simulate buttons. Real Velx moves on its own, and Jira
  would need a refresh, a webhook or polling to see it.
- **Velx → Jira:** showing linked Jira issues inside Velx would need a Velx change or a JQL-searchable
  (indexed) issue property.
- **Data residency:** issue titles and descriptions are sent to Velx when creating an initiative.

## Known limits (prototype only)

- The goal is shown as plain text: UI Kit has no Markdown renderer.
- Isolated Cloud tokens are rejected.
