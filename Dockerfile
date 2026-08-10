# Estiva Ship — production image.
#
# A static bundle behind nginx. The build happens here rather than in CI so the
# image is the whole artifact: given a commit and these three build args, the
# result is reproducible without knowing what a workflow file did.
#
# Served at the document root of its own hostname, `ship.estiva.app`.
#
# An earlier version served `/ship/` under the relay's hostname, on the theory
# that sharing an origin removed CORS "by construction". It does — but the relay
# already has `BUZZ_CORS_ORIGINS`, and `peek.estiva.app` was always going to be
# a separate origin anyway, so the constraint bought nothing and cost a
# path-ordering rule in the tunnel that silently sent every request to the relay
# when mis-ordered. A dedicated hostname has no ordering to get wrong.

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

COPY --from=build /app/dist/ship /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Distinguishes "nginx is up" from "nginx is up and the bundle is actually in
# the image" — a COPY that silently moved would otherwise deploy a 404 and
# report healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
