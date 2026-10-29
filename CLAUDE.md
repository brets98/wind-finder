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
- Current API: `GET /api/users` (admin), `GET /api/users/:id` (yourself, or admin); `GET|POST /api/invites`, `DELETE /api/invites/:id` (admin; the list says for each email whether an account exists, `registered`; a refused invite answers `400`/`409` with `issues: [{ code }]`, `EMAIL_INVALID` or `ALREADY_INVITED`). Spots, settings and preferences: see "Domain".

## Domain

### Data sources

All free, each wrapped in an **adapter** in `server/src/sources/<name>.ts` returning the normalized types of `server/src/sources/types.ts` (knots, degrees, ISO UTC times, missing values as `null`); the rest of the app never calls an external API directly. HTTP goes through `fetchJson()` (`sources/http.ts`: descriptive `USER_AGENT`, timeout), which tests replace with `stubFetch()` (`server/test/fetch.ts`; Open-Meteo fakes in `test/sources-stubs.ts`).

- **Open-Meteo** (`open-meteo.ts`, no key): `FORECAST_MODELS` (checked against the API on 2026-10-29): high-res `italia_meteo_arpae_icon_2i`, `meteofrance_arome_france_hd`, `icon_d2`, `meteoswiss_icon_ch1`; global `ecmwf_ifs` (IFS HRES 9 km), `gfs_seamless`. Several models in one call, kept separate (variables `<variable>_<model>`; unsuffixed with a single model), several points per call (`fetchForecasts()`, up to 50). A model whose domain doesn't cover a point is missing from the response or all null: `probeModelsMany()` finds the covering models once per spot position and stores them in `spot.forecastModels` (emptied when the spot moves), so a spot never requests a model outside its domain. Marine API for sea spots (`fetchMarine()`); `hasMarineData()` (no waves on lakes and inland) guesses sea/lake on import. Past forecasts (Previous Runs / Historical Forecast APIs) come in Phase 2.
- **MeteoNetwork** (`meteonetwork.ts`): API v3 with a free **STANDARD** token in `METEONETWORK_TOKEN` (from `POST /v3/login`; never expires). Decided with the user on 2026-10-29: with STANDARD there is **no search by position and no history** (both BULK-only), so the admin adds stations **by code** and the app will **poll and keep readings itself** (needed from Phase 2 for the observed series). Only `data-realtime/{code}` is used: at most 5 requests per minute (`RateLimiter`), 1 per second. Its "no results / license does not allow distribution" answer (`status_code: 204`) means "station not usable", not an error. Wind speeds are assumed **km/h**: confirm against real data once the token is available.
- **Windy open-data stations** (`windy.ts`): Stations API v2, key in `WINDY_API_KEY` (header `windy-api-key`). Speeds in m/s, timestamps in ms, observations up to 7 days back (`observations(id, from)`). The open-data list has **no search by position**: `syncWindyCatalogue()` downloads it page by page and keeps the Italian stations (`isInItaly()`) in `windyStations`; the admin refreshes it from the station panel. Never use Windy's Point Forecast API.
- **METAR** (`metar.ts`, added 2026-10-29 with the user's approval): airport reports from NOAA's Aviation Weather Center (`aviationweather.gov/api/data`, public domain, no key, ≤100 requests/minute). ICAO station ids (LIPZ…), every 30 minutes, knots, gusts only when significant, `VRB` (variable light wind) stored as a null direction and still usable; 7 days of history; search by bounding box (`stationinfo`, keeping sites that issue METARs). Airports are often inland or km from the water: a reference rather than spot-exact.
- **ARPAV** (`arpav.ts`, added 2026-10-29 with the user's approval): Veneto's regional agency, public XML (`meteo.arpa.veneto.it/meteo/dati_meteo/xml/`: `stazioni.xml` list, cached a day, and one `<file>.xml` per station), **CC BY 4.0** (stated in each file), ISO-8859-1, not validated. Wind `VVENTO` (m/s at 10 m, converted to knots) and `DVENTO`, every 30 minutes, about 2 days of history, **no gusts**; times in solar time (UTC+1 all year). Station ids are ARPAV's `IDSTAZ` (168 = Chioggia - Sant'Anna). Several ARPAV stations also appear on Windy, where their copies stopped on 2026-10-25: prefer the ARPAV source.
- **Meteotrentino** (`meteotrentino.ts`, added 2026-10-29): Provincia di Trento, CC BY 4.0 (dati.trentino.it), no key. XML: `listaStazioni` (cached a day; closed stations have a `fine` date) and `ultimiDatiStazione?codice=` (since midnight of the day before). Wind every 15 minutes: mean `v` and max `vmax` (the gust) in m/s, direction `d`; solar time. **T0193 Torbole (Belvedere)** is Lake Garda's main kite area; most other Trentino stations have no anemometer.
- **ARPA Lombardia** (`lombardia.ts`, source `lombardia`, added 2026-10-29): Open Data Lombardia (Socrata), **CC0**. Registry `nf78-nj6b` (sensors with station and position; wind = "Velocità Vento" + "Direzione Vento"), data `647i-nhxk` (current month, every 10 minutes, solar time; operator 1 mean, 3 max = gust; -9999 missing; 777/7777 calm and 888/8888 variable = no direction; states VA/VV valid). Station ids are `idstazione` (573 = Colico, Lake Como). **Throttled very hard (HTTP 429)**: found on 2026-10-29 that a handful of requests exhausts both the token's quota (`LOMBARDIA_APP_TOKEN`) and the anonymous one, for hours, with no rate-limit headers. Requests are kept few (registry cached a day; checks share one request for the last 3 hours of every wind sensor, reused 5 minutes), and after a 429 the adapter sends nothing for 30 minutes. Data also arrive **~1.5 hours late** (newest reading 12:20 solar at 13:44). History (one request per station-day) worked; the live check was not confirmed before the throttle. **Do not work around the throttle** (other identities, user agents…). Status: unreliable as a live source; decision pending with the user.
- **Adapter interface**: every station source implements `StationAdapter` (`sources/types.ts`): `check()`, and where the source allows it `history(id, from, to)` and `nearby(point, km)`. Adding a source = a new adapter + its name in `STATION_SOURCES` (server) and `StationSource` + `t.sources` (client) + its credit on `/about`.
- **OpenStreetMap** (`overpass.ts`): Overpass query for `sport` containing `kitesurfing` or `kiteboarding` in Italy, nodes/ways/relations at their center, id `node/123`. About 34 results on 2026-10-29, mixed with clubs and shops: hence `to_verify`. The main Overpass server sometimes answers 502: the admin retries.
- **Not allowed**: scraping Windy, Windguru, Windfinder, Holfuy or other sites.
- **Attributions**: `/about` (`AboutPage`) credits Open-Meteo, MeteoNetwork (CC BY 4.0), Windy stations, OpenStreetMap (ODbL) and the tiles; the map shows the OSM attribution; the live panel says which source a reading comes from.

### Spots, good wind and stations

- **Units**: speeds stored in **knots**, directions in degrees (where the wind comes from), times in UTC, shown in **Europe/Rome** (`server/src/domain/time.ts`, `client/src/lib/time.ts`). Each user picks knots or Beaufort (`preferences` collection, `GET|PATCH /api/me/preferences`; `knotsToBeaufort()` in `client/src/lib/units.ts`, WMO limits on rounded knots).
- **Spot** (`server/src/models/spot.ts`; fields checked by `parseSpot()`, `server/src/domain/spot.ts`, issue codes `REQUIRED`/`INVALID`/`TOO_LONG` with `field`): name, lat/lon, region, type `sea`/`lake`, status `to_verify`/`verified`, `osmId` (unique when set), `goodDirections` and `avoidDirections` (sectors `{ from, to }`, whole degrees clockwise, `340→20` wraps through north: `server/src/domain/directions.ts`), water, level, season, notes, `isStudySpot`, `station` and `backupStation` (`{ source, stationId, name, lat, lon, distanceKm, notes }`, always source + id), `forecastModels`. **Regular users see only verified spots** (others answer 404).
- **Good wind** (`server/src/domain/good-wind.ts`, the one place to change it): at least `minKnots` (default 14) from a good direction and never from an avoided one, for at least `minHours` (default 3) **consecutive** hours. The day indicator (`dayIndicator()`, per Europe/Rome date) counts the models with data that day: **yes** when at least half of them predict good wind, **maybe** when at least one does, **no** when none does, `null` without data or without good directions. All 24 hours count (no daylight filter yet). Thresholds in the `settings` document (`getSettings()`, created with defaults), `GET /api/settings` for everyone, `PATCH` admin only.
- **Forecast cache** (`server/src/services/forecasts.ts`, collection `cache` with a TTL index): forecasts for an hour (high-res models update every 1–3 h), waves for 3 hours; the key includes position and models. The list groups spots with the same models into one Open-Meteo call; a spot whose forecast fails gets null indicators instead of breaking the list. About 25 kB per spot.
- **Stations** (`server/src/services/stations.ts`): checks are cached in memory for 5 minutes (MeteoNetwork's limit; single instance). A reading older than **3 hours** is stale. **Live panel** (`GET /api/spots/:id/live`): the main station's latest reading; when it has none or it is stale, the backup's (`usingBackup: true`); otherwise the old reading flagged `stale`; `null` without a station. The spot list shows live wind only from readings already cached (it never waits for stations). **Suggestions** (`GET /api/spots/:id/station-suggestions`, admin): stations within **20 km** from Windy (local catalogue), METAR, ARPAV, Meteotrentino and ARPA Lombardia (`nearby`), nearest first, at most 20 checked, each with `usable` and `reason` (`not_available`, `no_wind`, `no_data`, `stale`, `error`); the client hides unusable ones behind a toggle. MeteoNetwork: `GET /api/spots/:id/station-check?source=meteonetwork&stationId=…`. `PUT /api/spots/:id/stations` (`station`, `backupStation`, each `{ source, stationId, notes }` or null) looks each station up at its source for name and position; unknown ones answer `STATION_NOT_FOUND`.
- **OSM import** (`POST /api/spots/import-osm`, `server/src/services/osm-import.ts`): creates new candidates as `to_verify`, named after OSM (`OSM node/123` when unnamed), type guessed from the Marine API. Never duplicates or overwrites a spot with the same `osmId`; deleting an imported spot adds its id to `settings.ignoredOsmIds`, so a re-import doesn't bring it back.
- **API** (`server/src/routes/spots.ts`): `GET /api/spots` (list: summary, `isFavorite`, `today`/`tomorrow` indicators, `live`), `GET /api/spots/:id`, `GET /api/spots/:id/forecast` (every model with `group` and per-hour `good`, `marine` for sea spots, `goodWind`, each day's indicator), `GET /api/spots/:id/live`, `PUT|DELETE /api/spots/:id/favorite` (favorites: one document per user, `favorites` collection). Admin: `POST /api/spots`, `PATCH|DELETE /api/spots/:id` (delete also removes it from favorites), the import, suggestions, check and stations routes above, `GET /api/settings/windy-catalogue` and `POST /api/settings/windy-catalogue/sync`.
- **Reference spot**: Sottomarina (Chioggia), sea and study spot. **Solved with ARPAV** (approved 2026-10-29): usable live stations 168 Chioggia - Sant'Anna (6.5 km), 112 Rosolina (14.8 km), 175 Codevigo (17.2 km), 178 Cavarzere (18 km); none has gusts. Before that, with the real Windy key: **no usable station from Windy or MeteoNetwork**. Windy has 6 stations within 20 km, all offline: "Chioggia (centro)" and "Chioggia - Sant'Anna" are ARPAV stations republished on Windy, stopped on 2026-10-25; the CNR Acqua Alta tower never sent data. MeteoNetwork's Chioggia stations are offline or not licensed. Ruled out: Centro Maree (Diga Sud Chioggia station, but no licence or machine-readable feed, open-data site behind an anti-bot wall) and ISPRA's Venice lagoon network (real-time only as images, history behind a login).
- **Open issue (user, 2026-10-29)**: the user is not satisfied with the data of spots (OSM import) and especially of weather stations. Done: METAR and ARPAV, then Meteotrentino and ARPA Lombardia (chosen from the survey in `docs/station-sources.md`); MeteoNetwork still waits for its token (wind unit unconfirmed).

### Days and sessions

- **Day** (`server/src/models/day.ts`, collection `days`, unique per spot + local date): `hours` (start of every hour of the Europe/Rome day, UTC: 24, or 23/25 when the clocks change, `localHours()`), `forecasts` (every covering model, two runs: **`d1`** = value predicted 24 h before each hour, **`d0`** = the latest run before each hour, i.e. the live forecast as the day was; from Open-Meteo's **Previous Runs API**, `fetchPastForecast()`, archive from 2024-01-01; requested in UTC over two dates and cut to the local day, because Open-Meteo's `timezone` uses a fixed offset), `marine` (sea spots, `fetchMarineDay()`), `observed` (every station reading of the day, main station first then the backup, with `status` `ok`/`partial`/`unavailable` and `reason` `no_station`/`no_history`/`too_old`/`no_data`/`error`), `reasons` (`auto_forecast`, `auto_observed`, `manual`, `session`). Missing values are stored as null (e.g. ICON-CH1 has no `d1`: its horizon is too short).
- **Filling** (`server/src/services/days.ts`): `ensureDay()` upserts the Day and adds the reason; `fill()` fetches what is still missing: forecasts until `forecastsFinal` (fetched after the day was over), observations until `observed.final`. A partial Day is completed again when read (`GET /api/days/:id`), at most every **30 minutes** (`REFILL_MS`); the nightly job (Phase 3) will do it too. Observations come from the source's history (`stations.history()`: Windy and METAR 7 days, ARPAV about 2 days); **MeteoNetwork has none** until the app records its readings (Phase 3), so its Days say `no_history`; older than 7 days: `too_old` (final).
- **Size**: about **14.5 kB** per Day measured with real data (12 model runs, 95 readings, waves); `estimateDayBytes()` keeps a full Day under 20 kB. A thousand Days a year is about 15 MB on the shared Atlas tier.
- **Session** (`server/src/models/session.ts`, collection **`outings`**: `sessions` belongs to Better Auth's sign-in sessions, never use it): user, spot, date, Day, start/end (local "HH:mm"), sport (`kite`, `foil`, `wing`, `windsurf`, `other`), size (m²), board, perceived wind (knots), gustiness, sea state, rating 1–5, comment, visibility `group` (default) or `private` (`visibleTo()`: **only the owner** sees private ones, admins included). Checked by `parseSession()` (`server/src/domain/session.ts`; dates from 2024 to today; codes `REQUIRED`, `INVALID`, `OUT_OF_RANGE`, `BEFORE_START`, `TOO_LONG`). Logging a session saves its Day (reason `session`); two riders the same day share one Day. Only the rider edits or deletes; a new date moves the session to that Day; deleting a session keeps the Day.
- **API**: `POST /api/spots/:id/days` (`date`, default today: "save this day"), `GET /api/spots/:id/days` (history, newest first, max 100, each with `observedStatus`, `maxObserved` and its visible sessions), `GET /api/days/:id` (whole Day with `observed.hourly` and visible sessions), `GET /api/sessions` (board: `spotId`, `userId`, `offset`, pages of 20, each card with spot, rider name and `chart`: D-1/D0 of the first high-res model with data plus observed per hour, `cardChart()`), `GET /api/sessions/filters` (spots and riders in visible sessions; never emails), `POST /api/sessions`, `GET|PATCH|DELETE /api/sessions/:id`.

### Still to come (from the brief)

Push subscriptions and a notification log (Phase 3).

### Client

- **Home** (`HomePage`): phones (below 900 px, `DESKTOP_QUERY`) get the list (favorites, then by distance from the browser's position, by name when refused: `sortSpots()`) with a Map tab (`?view=map`); desktop gets a full-screen map with a side list of the spots in the visible area. Rows show type, distance, today/tomorrow indicators and live wind (`SpotList`).
- **Map** (`SpotMap`): Leaflet + react-leaflet with OpenStreetMap's standard tiles and attribution; spots as circle markers coloured by today's indicator. Tested by hand (mocked in tests: Leaflet needs a real browser).
- **Spot page** (`SpotPage`): header with compass rose (`CompassRose`), facts and notes, live panel (`LivePanel`, reloaded every 5 minutes), forecast (`ForecastView`): high-res models hour by hour for 3 days, global models collapsed and every 3 hours for 7 days, cells coloured by speed with gusts in small print and good hours outlined; waves for sea spots; the lake note for lakes; favorite, **Log a session** (`/spots/:id/sessions/new`, `SessionFormPage`, also `/sessions/:id/edit`) and **Save this day** (today) buttons; the spot history (`SpotHistory`): saved Days, each opening to its chart (model picker), observed station or the reason it is missing, and its sessions (`SessionSummary`).
- **Board** (`/board`, `BoardPage`): visible sessions newest first, filters by spot and rider in the URL (`?spot=&rider=`), "Load more", cards with a compact chart.
- **Charts** (`WindChart`, following the dataviz method): one axis in the user's unit; D0 forecast (slot 1 blue), observed (slot 2 orange), D-1 forecast (slot 3 aqua, dashed), perceived (slot 4 yellow, a band over the session's hours); CSS variables `--series-*` with dark-mode steps; palette validated in both modes (light aqua/yellow are below 3:1, hence legend, dash, band and the table view); crosshair tooltip with every value; "Show as table".
- **Admin** (menu items for admins only, routes registered only for admins): `/admin/spots` (list, OSM import, delete), `/admin/spots/new` and `/admin/spots/:id` (`SpotEditPage`: fields, direction sectors with a live rose, `StationsPanel`), `/admin/settings`, `/admin/invites`, `/admin/users`.
- **PWA**: `public/manifest.webmanifest`, icons (`public/icon-*.png`, white kite on teal), `public/sw.js` registered in production only: hashed `/assets/` cache-first, pages network-first with the cached app as offline fallback, `/api` never cached. Web Push will go in the same service worker (Phase 3).

## Phases

- **Phase 0, foundation**: done (PR #1).
- **Phase 1**: done (PR #2), with the open issue above on spot and station data.
- **Phase 2** (branch `phase-2/days-sessions`): Day and Session models, "log a session" and "save this day", spot history, board.
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

Client: React Router (`client/src/App.tsx` defines routes; signed-in pages render inside `components/Layout.tsx`, with the menu), pages in `client/src/pages/` (admin ones in `pages/admin/`), API calls via `apiGet()`/`apiPost()`/… in `client/src/lib/api.ts`, API types in `lib/spots.ts`. The user's unit comes from `usePreferences()` (`lib/preferences.ts`, provided by `components/PreferencesProvider.tsx`; tests without a provider get knots). Tests mock the auth client with `vi.mock('…/lib/auth-client')` (mock in `lib/__mocks__/`) and the API with `stubApi()` (`src/test/fetch.ts`).

**Languages**: the UI ships in **English only** for now, with Tornei's i18n structure kept so Italian can be added without refactoring. Strings live in `client/src/i18n/en.ts` (defines the shape, `Messages`); components read them with `const { t } = useI18n()` and fill `{placeholders}` with `fill()`. Never hardcode UI text, including the app name (`t.app.name`). Adding a language: a dictionary with the same keys, plus its code in `LANGUAGES` and `locales` (`client/src/i18n/context.ts`); the `LanguageSwitch` shows up by itself once there are two. The server sends codes (e.g. `issues`), never UI text.

`client` and `server` are independent npm packages (no workspaces), each with its own `package-lock.json`. Docker builds use the repository root as context.

## Conventions

- Secrets and credentials only in `.env` (never committed). Every new variable must be added to `.env.example` with a comment.
- Lint and formatting with ESLint + Prettier (shared `.prettierrc.json` at the root).
- Every collection has an id and a last-change time: always build Mongoose schemas with `createSchema()` from `server/src/db/schema.ts` (adds `createdAt`/`updatedAt` and exposes `id` instead of `_id` in JSON).
- Domain logic in pure functions with unit tests in `server/src/domain/`.
- Tests: Vitest for the client; Vitest + Supertest for the API. API tests that need a database use `useTestDatabase()` from `server/test/db.ts` (in-memory MongoDB); `createTestApp()`, `invite()` and `signUp()` (invites, signs up and verifies; optionally admin) from `server/test/app.ts`; external sources are stubbed with `stubFetch()`, never called.
- Every phase/feature on a dedicated branch, with small, descriptive commits; merge into `main` via pull request.
- Before declaring a task done: lint and tests must pass and the app must start with Docker Compose.

## Deploy

- **Target server**: the same Google Cloud free `e2-micro` VM as Tornei (1 GB RAM + swap). Every container has a memory limit in `docker-compose.prod.yml` (server 256 MB with a 160 MB Node heap, web 64 MB, backup 256 MB). Keep new services light.
- **Front proxy**: Tornei's Caddy owns ports 80/443 and terminates HTTPS for both apps; Wind Finder's `web` serves plain HTTP on `127.0.0.1:${WEB_PORT:-8081}`. Proposed in `docs/deploy.md`: a site block for Wind Finder's domain in Tornei's Caddyfile proxying to `host.docker.internal:8081`. **Deferred** (user, 2026-10-29): development stays local for now; the Tornei change and the choice of domain will be made when it is time to go online.
- **Before going online**: rename the app, because "Wind Finder" is too close to the existing Windfinder service (agreed with the user on 2026-10-29). The name lives in `APP_NAME` (`server/src/config.ts`), `t.app.name` (`client/src/i18n/en.ts`), `client/index.html`, `MAIL_FROM` defaults, the database name `windfinder`, the GHCR image names and `/opt/wind-finder`.
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
