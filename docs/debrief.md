# Project brief for Claude Code: wind & kite spot app (Italy)

You are going to build a new web app from scratch, in a **new repository**, step by step. Read this whole brief first, then start with **Phase 0**. Work one phase at a time, each on its own branch, merged via pull request; stop at the end of every phase so I can test it before you continue.

When something in this brief is unclear, or a decision would be hard to undo, ask me before implementing it. Do not add features that are not described here.

---

## 1. What the app does

A personal app (me plus a few invited friends) to:

1. browse **kite / water-sports spots in Italy**, on a list (mobile) or a map (desktop);
2. see the **wind forecast** for each spot from several weather models, side by side;
3. see the **live wind** measured by a weather station associated with each spot;
4. **log sessions** ("outings") with rating and comments, saving the whole day's forecast and observed data, so that over time we can "study" each spot: which model is right, which directions work, how far ahead a forecast can be trusted;
5. automatically archive "study days" for a few selected spots;
6. send **push notifications and an evening email** when good wind is expected or has happened.

Everything must stay **free to run**: free data sources, free hosting, no paid services. The project is non-commercial.

---

## 2. Reference project: reuse its foundation

My existing project **https://github.com/brets98/tornei** (public) has the technical foundation this app must share. Clone it and read its `CLAUDE.md` first.

Reuse, adapting names and removing the tournament domain:

- stack: React + Vite + TypeScript client; Node.js 24 + Express 5 + TypeScript (ESM) server; MongoDB with Mongoose; `createSchema()` conventions;
- authentication with **Better Auth** (Google + email/password, argon2id, email verification, sessions in MongoDB, roles `admin`/`user` via `ROLES` constants, `ensureDefaultRoles()`, `ensureAuthIndexes()`);
- **every `/api` route private by default** (global `requireAuth`, `requireAdmin` for admin routes, short explicit public allowlist);
- SMTP mailer (Mailpit in development);
- i18n structure (`client/src/i18n/en.ts` defines the shape). **This app ships in English only for now**, but keep the same structure so Italian can be added later without refactoring. Never hardcode UI text;
- Docker setup (dev with hot reload and polling, prod images), `.env.example` conventions, ESLint + Prettier, Vitest + Supertest with in-memory MongoDB, GitHub Actions CI/CD publishing to GHCR and deploying over SSH, the Mongo backup service;
- the same principles: **vendor independence** (open-source, self-hostable components; no SaaS or cloud-specific dependencies without asking me), **minimal costs**, **everything starts with `docker compose up`**.

Copy patterns and configuration, do not import code from that repository as a dependency.

---

## 3. Users and access

- Users: me (`admin`) and a few invited people (`user`).
- **Invite-only**: an `invites` collection with the email addresses allowed to register, managed by the admin from a page in the app. Sign-up (email or first Google login) succeeds only for an invited email; everyone else is refused. This replaces the need to toggle `SIGNUP_ENABLED` by hand. The first admin is created as in Tornei.
- **Only the admin** can create, edit, verify or delete spots, choose their stations and change global settings. Users can do everything else (favorites, sessions, notification preferences).

---

## 4. Data sources (all free)

Wrap every external source in an **adapter** (`server/src/sources/<name>.ts`) that returns data in one internal, normalized format. The rest of the app never talks to an external API directly. Live stations come from **two sources from the start** (MeteoNetwork and Windy open-data stations, sections 4.2 and 4.3); more sources (regional ARPA networks and similar) can be added later by writing only a new adapter.

All wind speeds are stored internally in **knots**, directions in degrees, times in UTC (displayed in Europe/Rome).

### 4.1 Forecasts: Open-Meteo
- Weather Forecast API, free for non-commercial use, no key. Request wind speed at 10 m, wind direction at 10 m and wind gusts at 10 m, hourly, in knots (`wind_speed_unit=kn`).
- Ask for **several models in one call** and keep them separate (do not use only "best match"):
  - high resolution, ~3 days: `italia_meteo_arpae_icon_2i` (ItaliaMeteo ARPAE ICON-2I, ~2 km, covers all of Italy), `meteofrance_arome_france_hd` / AROME where its domain covers the spot, `icon_d2`, `meteoswiss_icon_ch1` where its domain covers the spot (northern lakes);
  - global, up to 7 days: `ecmwf_ifs025` (or the ECMWF HRES model if available), `gfs_seamless`.
  - Check in the Open-Meteo documentation the exact model ids and which domains cover which spots; do not request a model for a spot outside its domain.
- **Past forecasts**: Open-Meteo keeps archived forecasts (Previous Runs API / Historical Forecast API). Use them to retrieve, after the fact, what the models predicted for a given day. Verify the exact endpoints and parameters in the documentation before implementing.
- **Marine API** (wave height, period and direction) for **sea spots only**.
- Cache responses in MongoDB (or memory) with a sensible TTL tied to model update times, so that opening the app does not call Open-Meteo every time.

### 4.2 Live stations: MeteoNetwork
- MeteoNetwork REST API v3 (Italian amateur network, data under CC-BY 4.0). Needs a free account: obtain a STANDARD token through the `/login` method and send it as `Authorization: Bearer <token>`. Credentials only in `.env`.
- Use it to: list stations near a point (to suggest stations for a spot), read realtime data of one station, and read recent data for a time window.
- Send a real, descriptive `User-Agent`. Respect throttling.
- The API keeps a **short history**: anything we want to keep must be saved by us soon after (see the jobs in section 8).
- **Many stations visible on the MeteoNetwork map are not available through the API.** Tested: `data-realtime/lmb015` returns data, while `vnt037` (Chioggia, offline) and `vnt326` (Chioggia Sant'Anna) answer `{"error":true,"status_code":204,"message":"No results found or the weather station license does not allow the distribution of weather data"}`. Handle this answer as "station not usable", not as an error. Some stations also have no anemometer.

### 4.3 Live stations: Windy open-data stations
- Windy Stations API v2 (`https://stations.windy.com/api/v2/...`, in force since January 2026; the legacy API stops at the end of 2026). A free **API key** (created on stations.windy.com, in `.env`) gives access to the personal weather stations that their owners publish under an **open license**: metadata and observations, history up to **7 days**. Check the exact endpoints and parameters in the official API reference before implementing.
- Only open-data stations are reachable: many stations visible on windy.com are not. This is the stations API only: never use Windy's Point Forecast API (its free trial key returns random data).
- Respect the license and attribution of each station's data.

### 4.4 Choosing a station for a spot
- The admin's station suggestion for a spot lists stations **from both sources** within ~20 km, ordered by distance, and shows **only stations that actually return recent wind data** (speed and direction; gust if available). Stations that answer "not usable", have no wind fields or whose last reading is older than a few hours are hidden (with a toggle to show them, greyed out, with the reason).
- If no usable station exists for a spot, the spot simply has no live panel: forecasts, sessions (perceived wind) and study days based on the forecast still work.

### 4.5 Spots discovery: OpenStreetMap
- Import candidate spots in Italy with an **Overpass API** query on `sport=kitesurfing` (also check `sport=kiteboarding`), nodes, ways and relations, using their center point.
- The import is an admin action (button in the admin area, can be re-run): new spots are created with status `to_verify`; spots already imported (same OSM id) are not duplicated or overwritten.
- The admin can also add spots manually.

### 4.6 Attribution
Show the required attributions in the app (footer or an "About / data sources" page): Open-Meteo, MeteoNetwork (CC-BY 4.0), Windy stations (as required by their open license), OpenStreetMap contributors (ODbL), and the map tiles. On the live panel, show which source the reading comes from.

### 4.7 Not allowed
Do not scrape Windy, Windguru, Windfinder, Holfuy or other websites. Do not use Windy's Point Forecast trial API (it returns random data).

### 4.8 Reference spot: Sottomarina
**Sottomarina (Chioggia, Venice)** is one of my main spots: a sea spot and a study spot. Use it as the reference case to test Phase 1 end to end (the admin creates it if the OSM import does not include it).

Tested so far: the MeteoNetwork stations in Chioggia are not usable (section 4.2). In Phase 1, look for a usable Windy open-data station near Sottomarina. If neither source has one, **search for a public alternative** (e.g. ARPAV, the Venice Tide Centre / Centro Maree) with open, free, real-time wind data and an API or a stable data file, **propose it to me** with its license and terms, and implement it as a new adapter **only after my approval**.

---

## 5. Domain model

Use `createSchema()` for every collection. Keep domain logic in pure functions with unit tests (`server/src/domain/`), as in Tornei.

### Spot
- name, location (lat/lon), region (optional), **type: `sea` | `lake`**;
- **status: `to_verify` | `verified`**, `osmId` when imported;
- **good directions**: one or more sectors (from/to degrees, e.g. 270°–340°); optionally **directions to avoid** (e.g. offshore);
- water (flat / chop / waves), level (beginner / intermediate / advanced), season, free-text notes (launch area, summer bans and corridors, dangers);
- **station**: `{ source, stationId, name, lat, lon, distanceKm, notes }` (`source`: `meteonetwork` | `windy`, extensible), plus an optional **backup station** with the same shape. Always store `source` + `stationId`, never only a source-specific id. If the main station stops returning data, the live panel uses the backup and says so;
- `isStudySpot` (boolean).

### Favorites
Per user, a list of spot ids.

### Settings (global, admin)
- **good wind**: minimum **14 knots** (editable), the spot's good directions, for at least **3 hours** (editable). This definition is used everywhere: list indicators, study days, notifications. Later it may become per user / per sport: keep it in one place.
- notification times (see section 9).

### User preferences
- unit: **knots** (default) or **Beaufort**, switchable; conversion as a tested pure function;
- notification preferences (push on/off, email on/off).

### Day (the core unit)
One document per **spot + date** (local date, Europe/Rome), containing the **whole day, all 24 hours**, not only the hours of a session:
- **forecasts**: for each model, hourly wind speed, gusts and direction, for at least two forecast runs: the **day before** (D-1) and the **morning of the day** (D0). Record which run each series comes from;
- **marine** forecast (sea spots only);
- **observed**: the station's data for the whole day (all readings, or 10-minute values), with the station reference used;
- `reasons`: why it was saved (`auto_forecast`, `auto_observed`, `manual`, `session`), possibly more than one;
- missing data is stored as missing, never invented.

If two users have a session at the same spot on the same day, there is **one Day** and two sessions linked to it.

### Session (outing)
- user, spot, date → linked Day, start and end time;
- sport (kite, foil, wing, windsurf…), gear (kite/wing size in m², board type);
- **perceived wind** (knots estimated by the rider) and gustiness (steady / gusty / very gusty);
- sea state (flat / chop / waves);
- **rating 1–5**, comment;
- visibility: **group** (default) or **private**.

### Push subscriptions, notification log
Store Web Push subscriptions per user/device, and a log of what was sent (to enforce the limits in section 9 and avoid duplicates).

---

## 6. Data storage rules

- Saving a Day stores the 24-hour data immediately: forecasts (via past-forecast APIs if the day is over) and the observed series.
- Observed data must be fetched **while the station API still has it**: the nightly job (section 8) saves the observed data of every Day created that day. If a session is logged days later and the station history is no longer available, the Day keeps the forecasts and marks the observed data as unavailable.
- Keep documents compact (arrays of hourly values, not one document per reading). Production runs on **MongoDB Atlas free tier (512 MB, shared with Tornei)**: estimate the size of a Day and keep it small.

---

## 7. User interface

**Mobile-first**, installable **PWA** (manifest, icons, service worker). English UI.

### Mobile
- Home = **spot list**: first the user's **favorites**, then all other spots ordered by **distance** (browser geolocation, with a fallback ordering by name if denied).
- Each spot row shows a compact indicator: **good wind today / tomorrow** (yes / maybe / no) computed from the good-wind definition and the spot's directions, plus the latest live wind if available.
- A **map** tab with the same spots.

### Desktop
- Home = **full-screen map with a side list synced to the visible area** ("store locator" style).

### Map
- **Leaflet with OpenStreetMap tiles** (no Google Maps). Respect OSM's tile usage policy and show the attribution.

### Spot page
- Header: name, type, status, good directions shown as a small **compass/rose**, notes.
- **Live panel**: latest station reading (wind, gust, direction), station name, **distance from the spot** and **age of the data** (clearly flag stale data).
- **Forecast**: hourly chart/table comparing the models. By default: **3 days with the high-resolution models**; the global models (up to 7 days) are collapsible. Hours with good wind from a good direction are highlighted.
- **Sea spots**: wave section. **Lake spots**: no wave section, and a visible note that on lakes the wind is mostly thermal and local, forecasts are indicative and the live station matters more.
- Buttons: favorite, **log a session**, **save this day** (manual Day save).
- **Spot history**: saved Days and sessions for this spot, each showing forecast vs observed vs perceived.

### Board
A feed of the group's sessions (newest first), filterable by spot and by person. Each card: spot, date, rider, rating, gear, perceived wind and a small **forecast vs observed** chart. Private sessions are visible only to their owner.

### Admin area
- spots: list, create, edit, verify, delete; **OSM import** button;
- **station association**: for a spot, list the usable stations from both sources within ~20 km (section 4.4), ordered by distance, with source and latest reading; choose the main and the backup station, add notes;
- invites (add/remove emails);
- global settings (good wind thresholds, notification times).

---

## 8. Scheduled jobs

The production server is an always-on VM, so jobs run **inside the Node server** with an in-process scheduler (single instance, like the SSE bus in Tornei). Times in Europe/Rome, configurable. Jobs must be light (1 GB RAM VM), sequential, idempotent and logged; a failed job must not crash the server.

- **Nightly (after midnight)**, for the day that just ended:
  - for every **study spot**: create/complete its Day if **the forecast predicted good wind OR the station measured good wind** for at least the minimum hours. Checking both is essential: saving only forecast-driven days would miss the days when the models under-predicted;
  - save the observed series for every Day created that day (sessions, manual saves);
  - make sure each Day has both the D-1 and D0 forecast runs.
- **Forecast refresh**: keep cached forecasts for favorite and study spots up to date after model updates.
- **Notifications** (section 9).

---

## 9. Notifications

Based on each user's **favorite spots** and the global good-wind definition.

- **Push (Web Push, VAPID keys in `.env`, e.g. the `web-push` library)**: **at most one per day per user in total**, grouping all spots with good wind expected in the coming days. The permission must be requested from a button, never on page load. On iPhone, web push works only when the app is installed on the Home Screen and opened from there: detect standalone mode and show instructions to install the app.
- **Evening email** (existing SMTP mailer), with two sections, each shown only if it has content:
  1. **today**: favorite spots where the station measured good wind today (hours, max wind, direction);
  2. **next days**: favorite spots with good wind forecast.
  If both sections are empty, **no email is sent**.
- Users can turn push and email on/off.

---

## 10. Deployment

- Same approach as Tornei: images on GHCR, deploy job over SSH, secrets only in the VPS `.env`, backups.
- It will run **on the same Google Cloud e2-micro VM as Tornei** (1 GB RAM): keep memory low and add memory limits. Ports 80/443 are already used by Tornei's Caddy, so **propose how to serve both apps from one Caddy** (separate domain or subdomain; domain to be decided by me). Do not modify the Tornei repository without asking me first.
- Database: a separate database in the **same Atlas free cluster** used by Tornei, via its own `MONGODB_URI`.
- Document the setup in `docs/deploy.md`.

---

## 11. Phases

Each phase: dedicated branch, small commits, tests, lint, typecheck, app starting with Docker Compose, PR. Stop after each phase.

### Phase 0: foundation
New repository with the Tornei foundation (section 2), tournament domain removed, invite-only access (section 3), an empty home page, CI. Write this project's own **`CLAUDE.md`** (in English, same style as Tornei's), summarizing this brief and the decisions, and keep it updated in every phase.

### Phase 1: spots, forecasts, live wind
Spot model and admin pages, OSM import, favorites, **MeteoNetwork and Windy open-data station adapters** and station association (section 4.4), the Sottomarina check (section 4.8), Open-Meteo adapters (forecast, marine) with caching, mobile list and desktop map, spot page with live panel and multi-model forecast, units (knots/Beaufort), PWA basics, attributions.

### Phase 2: sessions and board
Day and Session models, "log a session" and "save this day" (24-hour data, D-1 and D0 runs via past-forecast APIs), spot history (forecast vs observed vs perceived), board.

### Phase 3: study days and notifications
In-process scheduler and jobs (section 8), automatic study days, Web Push, evening email, notification preferences.

---

## 12. Out of scope for now

Photos, Italian translation (structure ready, content later), other station sources beyond MeteoNetwork and Windy (ARPA networks and similar: designed for, not implemented, except what I approve for Sottomarina), per-user or per-sport good-wind thresholds, commercial use, native apps.
