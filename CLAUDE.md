# CLAUDE.md

Project instructions for Claude Code. Read them at the start of every session and update them whenever a decision changes.

## The project

Wind Finder: a personal web app (the admin plus a few invited friends) about **kite / water-sports spots in Italy**: spots on a list or a map, wind forecasts from several models side by side, live wind from a weather station near each spot, logged sessions, automatically archived "study days", and push/email alerts when good wind is expected. The full brief is `docs/debrief.md`; this file summarizes it and records the decisions taken since. Non-commercial and **free to run**: free data sources, free hosting, no paid services.

Work one phase at a time (see "Phases"), each on its own branch, merged via pull request; stop at the end of every phase so the user can test it. Ask before anything unclear or hard to undo, and do not add features the brief does not describe.

The technical foundation comes from the user's **Tornei** project (<https://github.com/brets98/tornei>, public): copy its patterns and configuration, never import its code as a dependency, and do not modify that repository without asking.

## Principles

- **Vendor independence**: only open-source, self-hostable components. Do not introduce SaaS services, paid libraries or dependencies tied to a specific cloud without asking first.
- **Minimal costs**: everything runs on the single free VM shared with Tornei, with Docker Compose.
- **Everything in Docker**: the whole project starts with `docker compose up`, in development and in production.

## Stack (MERN, as Tornei)

- **Frontend**: React + Vite, TypeScript
- **Backend**: Node.js (LTS, currently 24) + Express 5, TypeScript (ESM)
- **Database**: MongoDB. Development: a container with data on a Docker volume (database `windfinder`). Production: its own database `windfinder` in the **same MongoDB Atlas free cluster as Tornei** (512 MB shared: keep documents compact), reached through `MONGODB_URI` in `.env`.
- **ODM**: Mongoose
- **Reverse proxy (production)**: Caddy. The production `web` image is Caddy serving the built client and proxying `/api/*` to the server, over plain HTTP behind Tornei's Caddy (see "Deploy").

## Authentication

- Handled in the backend with **Better Auth** (open source, self-hosted), configured in `server/src/auth/auth.ts` and mounted at `/api/auth/*`. The client uses its React client (`client/src/lib/auth-client.ts`).
- Providers: **Google (OAuth 2.0)**, enabled only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, and **email + password**. Passwords are hashed with **argon2id** (`@node-rs/argon2`), minimum 10 characters.
- **Invite-only registration** (replaces Tornei's `SIGNUP_ENABLED`, which does not exist here): the `invites` collection (`server/src/models/invite.ts`) holds the email addresses allowed to register, managed by the admin on the Invites page. Every user creation goes through Better Auth's `databaseHooks.user.create.before`, which refuses an email that is not invited with the code `not_invited` (`NOT_INVITED`); a refused Google login comes back as `/sign-in?error=not_invited`. Email sign-up is checked again in the `hooks.before` request hook, because with email verification on Better Auth answers a refusal from the database hook with a fake success (anti-enumeration), and the person would wait for an email that never comes. Emails are compared trimmed and lowercased (`normalizeEmail()`, `server/src/domain/email.ts`). Removing an invite does not delete an account already created with it.
- Email + password requires **email verification** before sign-in; password reset by email link. Emails go through SMTP (`server/src/mail/mailer.ts`); in development they are caught by Mailpit.
- **Apple Sign In: do NOT implement** until explicitly requested (it requires the paid Apple Developer Program).
- Server-side sessions stored in MongoDB, cookies `httpOnly`, `sameSite=lax`, and `secure` in production (HTTPS).
- A user can link multiple providers to the same account (same email), only when the email is verified on both sides.
- Better Auth owns the `users`, `sessions`, `accounts` and `verifications` collections. `users` has the extra fields `surname` (required on email sign-up) and `role` (cannot be set by the client).
- **Roles** are stored in the `roles` collection (`server/src/models/role.ts`); `user.role` holds the role's `name`: `admin`, `user` (default), created on startup by `ensureDefaultRoles()`. Use the `ROLES` constants, never string literals. `server/src/models/user.ts` is a Mongoose read model of `users`.
- **Only the admin** creates, edits, verifies or deletes spots, chooses their stations, manages invites and changes global settings. Users do everything else (favorites, sessions, notification preferences).
- **First admin** (nobody is invited at first): in mongosh insert an invite, sign up, then set the role. Development: `docker compose exec mongo mongosh windfinder`; production: `docker compose exec backup bash -c 'mongosh "$MONGODB_URI"'`. Then `db.invites.insertOne({ email: '...', createdAt: new Date(), updatedAt: new Date() })`, sign up and verify, and `db.users.updateOne({ email: '...' }, { $set: { role: 'admin' } })`.
- `ensureAuthIndexes()` (`server/src/auth/indexes.ts`) creates Better Auth's indexes on startup, with TTL indexes deleting expired sessions and tokens.
- Client IP (rate limiting, sessions): Better Auth reads `X-Forwarded-For`. Tornei's Caddy sets it to the connecting client; Wind Finder's Caddy trusts it from private addresses only (`trusted_proxies static private_ranges`) and is published on localhost only.

### Auth: still to do

Before going live: test Google login, the `not_invited` redirect and account linking end to end with real credentials.

When a feature needs it: account page, account deletion (GDPR) and privacy policy, HTML email templates.

### API access: private by default

- **Every `/api` route requires an authenticated user**, enforced by one global check (`requireAuth` in `server/src/app.ts`), not per route. Unauthenticated requests get `401`. Inside protected routes the user is `req.user`; use `requireAdmin` for admin-only routes.
- Public routes are an explicit, short allowlist, mounted before `requireAuth`: `GET /api/health` and `/api/auth/*`. Make any other route public only when there is a concrete need, and only after asking.
- Signed-out visitors see the sign-in page on every path: the app has no public content.
- Never expose other users' personal data. The frontend calls protected routes with the session cookie: no tokens or secret keys in client code.
- Current API: `GET /api/users` (admin), `GET /api/users/:id` (yourself, or admin); `GET|POST /api/invites`, `DELETE /api/invites/:id` (admin; the list says for each email whether an account exists, `registered`; a refused invite answers `400`/`409` with `issues: [{ code }]`, `EMAIL_INVALID` or `ALREADY_INVITED`).

## Domain (from the brief; built in the phases below)

- **Data sources**, all free, each wrapped in an **adapter** in `server/src/sources/<name>.ts` that returns one internal, normalized format; the rest of the app never calls an external API directly:
  - **Open-Meteo** forecasts: several models in one call, kept separate (high resolution ~3 days: ItaliaMeteo ARPAE ICON-2I, AROME, ICON-D2, MeteoSwiss ICON-CH1 where their domains cover the spot; global up to 7 days: ECMWF IFS, GFS). Previous Runs / Historical Forecast APIs for past forecasts; Marine API for sea spots only. Cached in MongoDB with a TTL tied to model update times. Verify model ids, domains and endpoints in the documentation before implementing.
  - **Live stations** from **MeteoNetwork** (API v3, STANDARD token via `/login`, CC-BY 4.0, short history; the "license does not allow distribution" answer means "station not usable", not an error) and **Windy open-data stations** (Stations API v2, free API key, 7 days of history). More sources (ARPA networks…) later, by writing only a new adapter.
  - **OpenStreetMap** Overpass import of candidate spots (`sport=kitesurfing`, `sport=kiteboarding`), as an admin action, idempotent by OSM id.
  - **Not allowed**: scraping Windy, Windguru, Windfinder, Holfuy or other sites; Windy's Point Forecast API (its trial key returns random data).
  - Show the attributions (Open-Meteo, MeteoNetwork CC-BY 4.0, Windy stations' licenses, OpenStreetMap ODbL, map tiles); the live panel says which source a reading comes from.
- **Units**: wind speeds stored in **knots**, directions in degrees, times in UTC (shown in Europe/Rome). Users can switch knots/Beaufort.
- **Collections** (each with `createSchema()`): spots (type `sea`/`lake`, status `to_verify`/`verified`, good and avoided direction sectors, main and backup station as `{ source, stationId, … }`, `isStudySpot`), favorites, global settings (good wind: at least **14 knots** from a good direction for at least **3 hours**, editable, defined in one place), user preferences, **Day** (one per spot + local date, all 24 hours: forecasts per model for the D-1 and D0 runs, marine, observed series, `reasons`; missing data stays missing), sessions, push subscriptions and a notification log.
- **Reference spot**: Sottomarina (Chioggia), a sea and study spot. Its MeteoNetwork stations are not usable; if Windy has none either, propose a public alternative (ARPAV, Centro Maree…) with its license and implement it only after approval.

## Phases

- **Phase 0, foundation** (this phase): Tornei's foundation without the tournament domain, invite-only access, an empty home page, CI, this file.
- **Phase 1**: spots and admin pages, OSM import, favorites, MeteoNetwork and Windy station adapters and station association, the Sottomarina check, Open-Meteo adapters with caching, mobile list and desktop map (Leaflet + OSM tiles), spot page with live panel and multi-model forecast, units, PWA basics, attributions.
- **Phase 2**: Day and Session models, "log a session" and "save this day", spot history, board.
- **Phase 3**: in-process scheduler and jobs, automatic study days, Web Push, evening email, notification preferences.

Out of scope for now: photos, Italian translation (structure ready), station sources beyond MeteoNetwork and Windy (except what the user approves for Sottomarina), per-user or per-sport thresholds, native apps.

## Repository structure

```
/client                      # React + Vite
/server                      # Express API (src/, tests in test/)
/docker                      # Dockerfiles and configuration
  server.Dockerfile          #   targets: dev, prod
  web.Dockerfile             #   targets: dev (Vite), prod (Caddy + built client)
  Caddyfile                  #   plain HTTP, behind Tornei's Caddy
docker-compose.yml           # development (hot reload)
docker-compose.prod.yml      # production
.env.example                 # all required variables, without real values
.github/workflows/ci.yml     # CI/CD with GitHub Actions
docs/debrief.md              # the project brief
docs/deploy.md               # production setup next to Tornei
```

Client: React Router (`client/src/App.tsx` defines routes; signed-in pages render inside `components/Layout.tsx`, with the menu), pages in `client/src/pages/`, admin pages under `/admin/…` (`/admin/invites`, `/admin/users`), API calls via `apiGet()`/`apiPost()`/… in `client/src/lib/api.ts`. Tests mock the auth client with `vi.mock('…/lib/auth-client')` (mock in `lib/__mocks__/`).

**Languages**: the UI ships in **English only** for now, with Tornei's i18n structure kept so Italian can be added without refactoring. Strings live in `client/src/i18n/en.ts` (defines the shape, `Messages`); components read them with `const { t } = useI18n()` and fill `{placeholders}` with `fill()`. Never hardcode UI text, including the app name (`t.app.name`). Adding a language: a dictionary with the same keys, plus its code in `LANGUAGES` and `locales` (`client/src/i18n/context.ts`); the `LanguageSwitch` shows up by itself once there are two. The server sends codes (e.g. `issues`), never UI text.

`client` and `server` are independent npm packages (no workspaces), each with its own `package-lock.json`. Docker builds use the repository root as context.

## Conventions

- Secrets and credentials only in `.env` (never committed). Every new variable must be added to `.env.example` with a comment.
- Lint and formatting with ESLint + Prettier (shared `.prettierrc.json` at the root).
- Every collection has an id and a last-change time: always build Mongoose schemas with `createSchema()` from `server/src/db/schema.ts` (adds `createdAt`/`updatedAt` and exposes `id` instead of `_id` in JSON).
- Domain logic in pure functions with unit tests in `server/src/domain/`.
- Tests: Vitest for the client; Vitest + Supertest for the API. API tests that need a database use `useTestDatabase()` from `server/test/db.ts` (in-memory MongoDB); `createTestApp()`, `invite()` and `signUp()` (invites, signs up and verifies; optionally admin) from `server/test/app.ts`.
- Every phase/feature on a dedicated branch, with small, descriptive commits; merge into `main` via pull request.
- Before declaring a task done: lint and tests must pass and the app must start with Docker Compose.

## Deploy

- **Target server**: the same Google Cloud free `e2-micro` VM as Tornei (1 GB RAM + swap). Every container has a memory limit in `docker-compose.prod.yml` (server 256 MB with a 160 MB Node heap, web 64 MB, backup 256 MB). Keep new services light.
- **Front proxy**: Tornei's Caddy owns ports 80/443 and terminates HTTPS for both apps; Wind Finder's `web` serves plain HTTP on `127.0.0.1:${WEB_PORT:-8081}`. Proposed in `docs/deploy.md`: a site block for Wind Finder's domain in Tornei's Caddyfile proxying to `host.docker.internal:8081`. **Pending**: the user's approval of that Tornei change and the choice of domain.
- GitHub Actions: on every push runs lint, format check, typecheck, tests and build; on `main` it builds the Docker images and publishes them to GHCR (`ghcr.io/brets98/wind-finder-server`, `ghcr.io/brets98/wind-finder-web`, tagged `latest` and the commit SHA). The `deploy` job copies `docker-compose.prod.yml` to the VPS as `docker-compose.yml` in `VPS_DIR` and runs `docker compose pull && up -d` with `IMAGE_TAG` set to the commit SHA; it is skipped until the variables `VPS_HOST`, `VPS_USER`, `VPS_DIR` and the secrets `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` are set.
- **Secrets in production live only on the VPS**, in `/opt/wind-finder/.env` (`chmod 600`). Images and CI never contain app secrets. Never put secrets in the client: `VITE_*` variables end up in the public bundle.
- **Backups**: the `backup` service runs `mongodump` against Atlas on start and every 24 hours into `./backups`, keeping `BACKUP_KEEP_DAYS` days (restore command in the compose file). Still to do: copy them off the server.

## Commands

```bash
# Development (app http://localhost:5174, API :3001, MongoDB 127.0.0.1:27018, emails http://localhost:8026)
docker compose up --build
# After adding/updating npm dependencies: -V refreshes the containers' node_modules volumes
docker compose up --build -V

# Production (needs .env: see .env.example and docs/deploy.md)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# In client/ or server/ (run `npm install` first)
npm run lint
npm run format          # or format:check
npm run typecheck
npm test
npm run build
```

Development host ports are shifted from Tornei's (5173, 3000, 27017, 8025) so both stacks can run at once. Hot reload in Docker uses polling (nodemon `--legacy-watch`, Vite `usePolling`), because file events don't propagate through bind mounts on Windows.
