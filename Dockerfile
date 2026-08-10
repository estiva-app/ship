# Estiva Ship — production image.
#
# A static bundle behind nginx. The build happens here rather than in CI so the
# image is the whole artifact: given a commit and these three build args, the
# result is reproducible without knowing what a workflow file did.
#
# The bundle is served from `/ship/`, not `/`. Cloudflare Tunnel forwards the
# matched path **unchanged** — a route for `estiva.estiva.app/ship/*` arrives
# here still asking for `/ship/...` — so the files have to live at that prefix
# or every request 404s. `index.html` loads `./bundle.js` relatively, so the
# app itself needs no knowledge of the prefix.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Baked in at build time, because the relay URL *is* the workspace — see the
# header comment in build.mjs. A bundle pointed at the wrong relay is a
# different application, not a misconfigured one.
ARG RELAY_URL=http://localhost:3000
ARG ID_BASE=
# Must match a `client_id` seeded in Estiva ID (`src/db/seed.ts`), or /sign
# refuses every request as an unknown app. Still `linear-lite` post-rename.
ARG CLIENT_ID=linear-lite

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json build.mjs ./
COPY apps ./apps
COPY lib ./lib
COPY src ./src

RUN RELAY_URL="$RELAY_URL" ID_BASE="$ID_BASE" CLIENT_ID="$CLIENT_ID" npm run build


FROM nginx:1.27-alpine AS runtime

# Served under the same prefix the tunnel routes, as above.
COPY --from=build /app/dist/ship /usr/share/nginx/html/ship
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Distinguishes "nginx is up" from "nginx is up and the bundle is actually in
# the image" — a COPY that silently moved would otherwise deploy a 404 and
# report healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ship/ || exit 1
