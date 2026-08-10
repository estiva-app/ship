# Deploying Estiva Ship

Target: the Hetzner box, reached through the `estiva-prod` Cloudflare Tunnel.
Public URL `https://estiva.estiva.app/ship/` — the **same origin as the relay**,
which is the whole point of serving it here rather than on Pages or Vercel.

## How this deploy works, and why

Identical in shape to Estiva ID's, and for the same reason: the Hetzner firewall
allows TCP 22 from one address, so CI cannot SSH here and is not given a key
that would let it.

```
push to main → CI: typecheck, test → build image → ghcr.io/estiva-app/ship:main
                                                          ↓
                        systemd timer on the box, every 2 min → update.sh
                                                          ↓
                                        pull → restart → health check
```

No migrations here — a static bundle has no schema — so `update.sh` is Estiva
ID's minus that step.

## Same origin is a requirement, not a preference

Ship talks to the relay from the browser. Serving it anywhere other than
`estiva.estiva.app` reintroduces CORS on every request, which is exactly what
the project decided against. The relay claims `/upload`, `/media`, `/info`,
`/health`, `/events`, `/query`, `/count`, `/api/*`, `/moderation/*`, `/hooks/*`
and `/_*`; `/ship/` is free.

**Cloudflare Tunnel forwards the matched path unchanged.** A route for
`estiva.estiva.app/ship/*` arrives at the container still asking for
`/ship/...`, so the files are baked in at `/usr/share/nginx/html/ship` rather
than at the document root. Moving them to `/` and expecting the prefix to be
stripped is the obvious mistake here.

## First deploy, by hand

### 1. Add the tunnel route — before the catch-all

In https://one.dash.cloudflare.com → **Networks** → **Tunnels** →
**estiva-prod** → **Published application routes**:

| Field | Value |
| -- | -- |
| Subdomain | `estiva` |
| Domain | `estiva.app` |
| Path | `ship/*` |
| Type | `HTTP` |
| URL | `localhost:8081` |

**Order matters.** The existing `estiva.estiva.app` route sends everything to
the relay; a path route evaluated after it never matches. Put this one above it.

Do **not** set `httpHostHeader`. Buzz binds each request to its community from
the original `Host`, and overriding it breaks tenant resolution with an empty
response rather than an error.

### 2. Make the image pullable

A new GHCR package is private by default even when its repository is public:

> GitHub → `estiva-app` → **Packages** → `ship` → **Package settings** →
> **Change visibility** → Public.

The box then needs no registry credentials, keeping the "no standing secrets on
the server" posture.

### 3. Lay out the deploy directory

```bash
ssh root@167.233.252.136 'mkdir -p /opt/estiva-ship'
scp deploy/docker-compose.yml deploy/update.sh \
    deploy/estiva-ship-update.service deploy/estiva-ship-update.timer \
    root@167.233.252.136:/opt/estiva-ship/
ssh root@167.233.252.136 'chmod +x /opt/estiva-ship/update.sh'
```

### 4. Start it

```bash
cd /opt/estiva-ship
docker compose pull
docker compose up -d
```

### 5. Verify through the tunnel

```bash
curl -I https://estiva.estiva.app/ship/
curl -sI https://estiva.estiva.app/health   # the relay still answers
```

Both must work: the first proves the path route landed, the second proves it did
not shadow the relay.

### 6. Turn on automatic deploys

```bash
cp estiva-ship-update.service estiva-ship-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now estiva-ship-update.timer
```

## Two things that must be true before sign-in works

Both live on the box, not in this repo, and neither fails loudly.

**`SHIP_REDIRECT_URIS` must contain the production URL.** Estiva ID matches
redirect URIs exactly (`src/config.ts`), and the seed reads this env var. Until
`https://estiva.estiva.app/ship/` is in `/opt/estiva-id/.env` and
`node dist/db/seed.js` has been re-run, `/authorize` refuses to send anyone back
and sign-in is broken while the app itself looks fine.

**The signing key must be a relay member.** `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`
in production, and Ship mints a fresh keypair per browser. See PEEK-55 — this is
per browser, not per person.

## Operating it

**Watch a deploy:** `journalctl -u estiva-ship-update -f`

**Deploy now:** `systemctl start estiva-ship-update`

**Roll back:** every build is tagged with its commit sha. Stop the timer first,
or it will pull `main` over the rollback within two minutes.

```bash
systemctl stop estiva-ship-update.timer
ESTIVA_SHIP_IMAGE=ghcr.io/estiva-app/ship:<sha> docker compose up -d --force-recreate
```

## Testing the image on a dev machine

```bash
docker build -t estiva-ship:local \
  --build-arg RELAY_URL=https://estiva.estiva.app \
  --build-arg ID_BASE=https://id.estiva.app .
docker run -d --name ship-verify estiva-ship:local
docker exec ship-verify wget -q -S -O /dev/null http://127.0.0.1/ship/
```

Check from inside the container: on Docker Desktop under WSL, ports published to
`127.0.0.1` are not forwarded into the WSL loopback, so `curl localhost:8081`
fails even when the container is healthy. That is a local quirk, not how the
Linux box behaves.
