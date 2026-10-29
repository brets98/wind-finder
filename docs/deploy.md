# Deploy next to Tornei on the free Google Cloud VM

Wind Finder runs on the **same e2-micro VM as Tornei** (1 GB RAM + 2 GB swap) and uses a
separate database in the **same MongoDB Atlas free cluster**. The VM itself (Docker, swap,
`deploy` user, SMTP, budget alert) is already set up by Tornei's
[`docs/deploy-gcp.md`](https://github.com/brets98/tornei/blob/main/docs/deploy-gcp.md):
this guide only covers what is different.

## How the two apps share ports 80/443

Tornei's `web` container (Caddy) already owns ports 80 and 443. Wind Finder's `web`
container is also Caddy, but it serves **plain HTTP on `127.0.0.1:8081`** (`WEB_PORT`) and
never faces the internet. Tornei's Caddy stays the only front door: it gets the HTTPS
certificate for Wind Finder's domain too and forwards that domain to `8081`.

```
internet ──443──▶ Tornei's Caddy ─┬─ tornei.example.com ──▶ Tornei (server, client)
                                  └─ wind.example.com ──▶ 127.0.0.1:8081 ──▶ Wind Finder's Caddy
                                                                              ├─ /api/* ▶ server
                                                                              └─ client files
```

Why this way: the two compose projects stay independent (no shared Docker network that
must exist before either starts), each app keeps its own images and release cycle, and
Wind Finder can be checked on the VM with `curl http://127.0.0.1:8081/api/health`.
Wind Finder's Caddy trusts the `X-Forwarded-For` sent from private addresses, so Better Auth
still sees the real client IP.

**Domain**: a separate domain or a subdomain (e.g. `wind.<your domain>`), to be decided.
Point its DNS `A` record to the VM's IP.

### Change needed in Tornei (not done yet: needs approval)

Two small changes in the Tornei repository:

1. `docker/Caddyfile`, a second site block:

   ```caddy
   {$WIND_DOMAIN} {
   	encode zstd gzip
   	reverse_proxy host.docker.internal:8081
   }
   ```

   (Guarded so it does nothing while `WIND_DOMAIN` is empty, or added only once the domain
   is chosen.)

2. `docker-compose.prod.yml`, on the `web` service: `WIND_DOMAIN: ${WIND_DOMAIN:-}` in
   `environment`, and `extra_hosts: ['host.docker.internal:host-gateway']` so the
   container can reach the VM's localhost port.

Then `WIND_DOMAIN=wind.<your domain>` in Tornei's `.env` on the VM.

## Memory

Each container has a memory limit (`docker-compose.prod.yml`): server 256 MB (Node heap
capped at 160 MB), web 64 MB, backup 256 MB. Keep new services light; check with
`free -h` and `docker stats --no-stream`.

## Steps

1. **Folder**, on the VM: `sudo mkdir -p /opt/wind-finder && sudo chown deploy: /opt/wind-finder`.
2. **Database**: in Atlas, the same cluster as Tornei. The existing database user works if it
   has _Read and write to any database_; otherwise create one. The VM's IP is already in
   **Network Access**. The database name goes after the host:
   `…mongodb.net/windfinder?retryWrites=true&w=majority`.
3. **`.env`**: as `deploy`, create `/opt/wind-finder/.env` from [`.env.example`](../.env.example),
   then `chmod 600 .env`. A new `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), not Tornei's.
   SMTP values can be the same as Tornei's, with a `MAIL_FROM` naming Wind Finder.
4. **Images**: after the first merge to `main`, make the packages `wind-finder-server` and
   `wind-finder-web` public on GitHub (or `docker login ghcr.io` on the VM).
5. **GitHub settings** (this repository, **Settings → Secrets and variables → Actions**):
   variables `VPS_HOST`, `VPS_USER` = `deploy`, `VPS_DIR` = `/opt/wind-finder`; secrets
   `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS`, the same values as Tornei's. The next push to `main`
   deploys.
6. **Front proxy**: the Tornei change above, then `docker compose up -d` in Tornei's folder.
7. **First admin** (registration is invite-only, and nobody is invited yet), as `deploy`:

   ```bash
   cd /opt/wind-finder
   docker compose exec backup bash -c 'mongosh "$MONGODB_URI"'
   # at the prompt: invite yourself
   db.invites.insertOne({ email: '<your email>', createdAt: new Date(), updatedAt: new Date() })
   ```

   Sign up on the site (or continue with Google), verify the email, then back in mongosh:
   `db.users.updateOne({ email: '<your email>' }, { $set: { role: 'admin' } })`.
   From then on, invite people from the **Invites** page.
8. **Google login** (optional): in the Google Cloud OAuth client used by Tornei (or a new
   one), add the redirect URI `https://<domain>/api/auth/callback/google`; put the client ID
   and secret in `.env`, then `docker compose up -d`.

## Day to day

- Every merge to `main` deploys automatically.
- Logs: `docker compose logs -f server`. Status: `docker compose ps`.
- Backups land in `/opt/wind-finder/backups` every day; copy them off the server now and then.
- The Atlas free tier (512 MB) is shared with Tornei: check the cluster size in Atlas now and then.
