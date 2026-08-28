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

# `apps/` is here for one file, and not for the app it is named after.
#
# web/src/router.ts re-exports ../../apps/ship/router rather than copying it:
# the hash router is pure, already tested, and every route it defines — including
# the inbound `#/o/<naddr>` that Peek's "open in Ship" links carry — has to
# survive the rewrite byte for byte. That was the right call while the image
# built the old app and `apps/` was present regardless.
#
# It is a real constraint on REW-9: deleting apps/ without first moving
# router.ts into web/ breaks this build with two TS2307s that name a path nobody
# would expect the React app to reference. Nothing else here compiles apps/, and
# build.mjs is deliberately absent — the fallback for a bad cutover is the
# previous image's sha tag, not a second bundle inside this one.
COPY apps ./apps

# The React app (REW-8).
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
