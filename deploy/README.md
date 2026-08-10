# Deploying Estiva Ship

Target: the Hetzner box, reached through the `estiva-prod` Cloudflare Tunnel.
Public URL `https://ship.estiva.app`.

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

## Its own hostname, not a path under the relay

An earlier version of this served `/ship/` under `estiva.estiva.app`, on the
theory that sharing an origin with the relay removed CORS "by construction".

It does. But the relay already has `BUZZ_CORS_ORIGINS`, and `peek.estiva.app`
was always going to be a separate origin regardless — so the constraint bought
nothing, and cost a tunnel path-ordering rule that had to sit *above* the
relay's catch-all. Mis-ordered, every request went to the relay and returned a
404 that looked like a broken nginx config. A dedicated hostname has no ordering
to get wrong.

Ship talks to the relay from the browser, so the relay must name this origin:

```
BUZZ_CORS_ORIGINS=https://estiva.estiva.app,https://peek.estiva.app,https://ship.estiva.app
```

in `/opt/buzz/.env`, followed by a relay restart. **Omit it and the app loads
fine and then fails every request**, which is a slow thing to diagnose.

## First deploy, by hand

### 1. Add the tunnel hostname

https://one.dash.cloudflare.com → **Networks** → **Tunnels** → **estiva-prod** →
**Published application routes**:

| Field | Value |
| -- | -- |
| Subdomain | `ship` |
| Domain | `estiva.app` |
| Path | *(empty)* |
| Type | `HTTP` |
| URL | `localhost:8081` |

`HTTP`, not `HTTPS`: that is the hop from `cloudflared` to the local container,
which has no certificate. The public side is HTTPS regardless — Cloudflare
terminates it at the edge. Adding the hostname creates the DNS record
automatically.

Order does not matter: this is a distinct hostname, so nothing else can shadow
it. That is the point.

Do **not** set `HTTP Host Header`. It does nothing useful here and breaks tenant
resolution if it ever gets copied to a relay route.

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
curl -I https://ship.estiva.app/
curl -s https://estiva.estiva.app/health   # the relay is untouched
```

If `/` returns 404, check whether the request reached nginx at all —
`docker logs estiva-ship-estiva-ship-1`. Only the `Wget` healthcheck in the log
means the tunnel never routed here, which is a Cloudflare problem, not an nginx
one.

### 6. Turn on automatic deploys

```bash
cp estiva-ship-update.service estiva-ship-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now estiva-ship-update.timer
```

## Two things that must be true before sign-in works

Both live on the box, not in this repo, and neither fails loudly.

**`SHIP_REDIRECT_URIS` must contain `https://ship.estiva.app/`.** Estiva ID
matches redirect URIs exactly (`src/config.ts`), and the seed reads this env
var. Until it is set in `/opt/estiva-id/.env` and `node dist/db/seed.js` has
been re-run, `/authorize` refuses to send anyone back and sign-in is broken
while the app itself looks fine.

**The signing key must be a relay member.** `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`
in production, and Ship mints a fresh keypair per browser. See PEEK-55 — this is
per browser, not per person:

```bash
docker compose exec relay buzz-admin add-member --pubkey <hex> --role member
```

Note `--pubkey` is a named flag, not positional.

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
docker exec ship-verify wget -q -S -O /dev/null http://127.0.0.1/
```

Check from inside the container: on Docker Desktop under WSL, ports published to
`127.0.0.1` are not forwarded into the WSL loopback, so `curl localhost:8081`
fails even when the container is healthy. That is a local quirk, not how the
Linux box behaves.
