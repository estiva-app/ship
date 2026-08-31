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
# header comment in web/vite.config.ts. A bundle pointed at the wrong relay is a
# different application, not a misconfigured one.
ARG RELAY_URL=http://localhost:3000
ARG ID_BASE=
# Must match a `client_id` seeded in Estiva ID (`src/db/seed.ts`), or /sign
# refuses every request as an unknown app.
ARG CLIENT_ID=estiva-ship

# The root install comes first and is not optional for the app below: web/
# compiles ../lib/nostr, whose imports of @noble/hashes and @noble/curves
# resolve out of the *root* node_modules. Installing only web/ fails with seven
# TS2307s that read as if the shared library were broken.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY lib ./lib
COPY src ./src

# The vendored projection runtime (PRO-7). `web/src/api/foreign.ts` imports it
# by relative path, so `tsc -b` inside the image resolves it or fails — and it
# failed, because this line was not added with the directory.
#
# It is worth knowing why this reached main. The Docker build runs only in the
# `publish` job, which is skipped on pull requests, so the `check` and `web`
# jobs were green on a tree that could not be built into an image. Any file the
# web build reaches which is not copied here fails at merge and nowhere earlier.
COPY interop ./interop

# The app (REW-8). `apps/` and build.mjs are gone — REW-9 deleted the vanilla
# app, and web/src/router.ts now holds the hash router outright instead of
# re-exporting it from there, which is what made the deletion possible.
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

COPY web ./web

# The same three names, the same meaning, and the same defaults the old build
# had — see the header of web/vite.config.ts. `npm run build` is
# `tsc -b && vite build`, and it writes ../dist/ship, which is what the runtime
# stage copies.
RUN cd web && RELAY_URL="$RELAY_URL" ID_BASE="$ID_BASE" CLIENT_ID="$CLIENT_ID" npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist/ship /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Distinguishes "nginx is up" from "nginx is up and the bundle is actually in
# the image" — a COPY that silently moved would otherwise deploy a 404 and
# report healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
