# Jira modules prototype

Throwaway Forge app that explores Jira issue-view modules and Forge Remote. It uses a
restaurant theme: every Jira issue is an order. Everything is written in TypeScript.

| Folder | What it is |
| --- | --- |
| `restaurant-prototype/` | The Forge app (registered as `restaurant-prototype` in the `dev` Developer Space) |
| `kitchen-backend/` | Stub backend reached through Forge Remote (Bun + Express) |

## The four modules

| Module | Name in Jira | UI | Talks to |
| --- | --- | --- | --- |
| `jira:issueAction` | Send to kitchen (••• menu) | UI Kit | Kitchen backend: `POST /kitchen/orders` |
| `jira:issueContext` | Table service (right sidebar) | UI Kit | Jira only, in the browser with `requestJira` |
| `jira:issuePanel` | Kitchen ticket (panel button) | UI Kit | Kitchen backend: `GET /kitchen/ticket`, `POST /kitchen/ticket/advance` |
| `jira:issueActivity` | Kitchen log (Activity tab) | UI Kit | Kitchen backend: `GET /kitchen/log` |

The UI uses Forge [manual packaging](https://developer.atlassian.com/platform/forge/manifest-reference/packaging/)
(preview): Forge does not compile or bundle it. Each module has an HTML entry in
`restaurant-prototype/src/frontend/` (for example `kitchen-log.html`) that loads its `.tsx`
file. `bun run build` bundles these entries into `restaurant-prototype/build/`, and that
folder is what `forge deploy` uploads, as one multi-entry resource (`frontend/<entry>` in
the manifest).

Restaurant mapping: issue number = table, assignee = waiter, status category = course
(seated, being served, paid), High/Highest priority = VIP or rush, labels = dietary notes,
summary = the dish.

## How a "Send to kitchen" request flows

1. The modal calls `invokeRemote({ path: '/kitchen/orders', body: { notes } })`. Only the notes are sent.
2. Forge proxies the call to `KITCHEN_URL` and adds a signed Forge Invocation Token (FIT) and
   the user's OAuth token (`x-forge-oauth-user`).
3. The backend verifies the FIT against Atlassian's JWKS (audience = our app ID) and logs the
   site, installation, user and issue it names.
4. The backend reads the issue from `{apiBaseUrl}/rest/api/3/issue/{key}` with the user's token,
   so Jira applies that user's permissions, and creates the ticket.

## Run it

Prerequisites: [Bun](https://bun.sh) 1.2+ for the backend and to build the Forge app, Node 22+
and the Forge CLI logged in (`forge login`) for the Forge app, `cloudflared`, and a Jira Cloud
developer site where you are an admin.

```powershell
# 1. Backend (Bun runs the TypeScript directly and loads .env by itself)
cd kitchen-backend
copy .env.example .env
bun install
bun run typecheck
bun test
bun start                      # http://localhost:3000/health

# 2. Public HTTPS URL for the backend (new terminal). Copy the https://....trycloudflare.com URL.
cloudflared tunnel --url http://localhost:3000

# 3. Forge app (new terminal)
cd restaurant-prototype
bun install
bun run typecheck              # tsc on src/frontend
bun run build                  # Bun bundles src/frontend/*.html into build/
$env:KITCHEN_URL = "https://<random>.trycloudflare.com"
forge lint
forge deploy -e development    # uploads build/ as-is: always run `bun run build` first
forge install -e development --site <your-site>.atlassian.net --product jira
```

The quick-tunnel URL changes every time cloudflared restarts. When it does, set the new
`KITCHEN_URL`, run `forge deploy` again, and then `forge install --upgrade` with the same site,
because a new remote URL is a major version.

To iterate on the UI Kit modules without redeploying, run `forge tunnel` (with `KITCHEN_URL`
set) while the backend and cloudflared are running. With manual packaging the tunnel serves
`build/`, not the sources, so run `bun run build` again after each change.

The frontend `tsconfig.json` lives in `src/frontend/`, not in the app root. With a root
tsconfig, `forge lint` (CLI 15.1) tries to type-lint the bundled `build/*.js` and fails.

## What to look at when testing

- Backend console: one `[forge]` line per request with site, cloudId, installation, module,
  user and issue, and a `[jira]` line with the fields read on the server.
- Open an issue, use ••• > Send to kitchen, then open the Kitchen ticket panel and the Kitchen
  log tab in Activity.
- Tamper test: calls to `/kitchen/*` without a valid FIT get 401 (`bun test` covers this).

## Known limits (prototype only)

- Tickets live in memory and are lost when the backend restarts.
- The "tenant" is the Forge installation ID. Mapping an installation to a tenant of a real product
  is out of scope.
- Isolated Cloud tokens are rejected.
