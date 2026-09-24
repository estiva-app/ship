# Estiva Ship — production image.
#
# The delivery envelope for a bundle CI has already built, the same as Peek's
# (PER-16). `publish` runs `npm run build` with the three build
# values, which writes dist/ship, and this copies it behind nginx.
#
# The build used to happen here, so that the image was the whole artifact. It
# cost ~60 s of every deploy (a 73 s image build against Peek's 10 s), it
# installed both package trees again inside Docker, and it compiled the app in
# a place no pull request ever ran — `scripts/docker-context.test.ts` existed
# only to catch a COPY missing from this file. Now the command that builds the
# image's bundle is the one the `build` job runs on every pull request.
#
# The three values are baked into the bundle, not read at runtime, because the
# relay URL *is* the workspace — see the header of vite.config.ts. They are
# set in deploy.yml's `publish` job; built without them the bundle points at
# http://localhost:3000 and offers no sign-in.
#
# Served at the document root of its own hostname, `ship.estiva.app`.
#
# An earlier version served `/ship/` under the relay's hostname, on the theory
# that sharing an origin removed CORS "by construction". It does — but the relay
# already has `BUZZ_CORS_ORIGINS`, and `peek.estiva.app` was always going to be
# a separate origin anyway, so the constraint bought nothing and cost a
# path-ordering rule in the tunnel that silently sent every request to the relay
# when mis-ordered. A dedicated hostname has no ordering to get wrong.

FROM nginx:1.27-alpine AS runtime

COPY dist/ship /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Distinguishes "nginx is up" from "nginx is up and the bundle is actually in
# the image" — a COPY that silently moved would otherwise deploy a 404 and
# report healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
