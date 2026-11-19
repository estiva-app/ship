---
name: verify
description: Use when you check a change to Ship's screens by looking at it (Storybook on :6007, measuring against the package part, `npm run smoke`) before you call it done.
---

# Verifying Ship changes by looking

"It looks right" is not a result. Say what you measured, not what you saw.

## The smoke test's Ship part

The smoke test ([estiva-app/smoke](https://github.com/estiva-app/smoke), checked out beside this repository as
`../smoke`) walks the core flows on production as two test accounts of its own. Ship takes part in flows 1, 3, 4, 5,
6, 8 and 10; its section of `../smoke/CORE-FLOWS.md` says what a person sees in each. `/land` runs every flow after
each deploy.

Against a local build, served at ship.estiva.app to the test's browser only, so sign-in and the relay behave as on
production while everyone else keeps the live app:

```bash
RELAY_URL=https://estiva.estiva.app ID_BASE=https://id.estiva.app CLIENT_ID=estiva-ship npm run build
cd ../smoke && npm ci && node run.mjs --flow 1,3,4,5,6,8,10 --serve ship=$OLDPWD/dist/ship
```

Against production, drop `--serve`. It exits 0 when every step passed or is known, 1 on a failed step (its screenshot
is in `out/<time>/`), 2 when it could not run. A change to how a core flow looks or works changes its step in the
smoke repository in the same work (`../smoke/README.md`). `npm run smoke` below is a different, older check against a
fake relay, and stays.

## Render it and measure it

- Start Ship's Storybook: `npm run storybook` → `http://localhost:6007`.
- Open the story and compare against the package component it is built from:
  height, radius, padding, colour.
- The package's own Storybook runs from the `estiva-ui` checkout beside this
  one: `npm run storybook` there → `:6008`.
- The `.verify-*.mjs` scripts and `.verify-shots/` tooling in the `peek`
  checkout beside this one do that against `:6008` (read-only; `.verify-shots/README.txt`
  says how).
- A driver script of your own goes in this repo's top folder, so Node finds
  `playwright-core` (a root devDependency). Name it `.verify-<what>.mjs` and
  delete it after: Ship's `.gitignore` does not list it.

## Restart Storybook

Restart it after any change to the Tailwind config, the package version, or a
file you replaced with a re-export. Until then it serves the old build.

## `npm run smoke`

- `npm run smoke` builds the app and drives it in chromium, against an
  in-memory relay (not production). Run it by hand before anything that
  touches a surface.
- It needs chromium's system libraries, which Playwright does not bundle —
  that is why CI does not run it.
- Port 5191 is also `npm run dev`'s. If it is taken: `SMOKE_PORT=5199 npm run smoke`.
- `--headed` shows the browser: `npx tsx scripts/smoke.ts --headed`.

## Not this

`npm run verify` (`scripts/verify.ts`) is a different thing: it publishes a
test project and issues to a live relay (`RELAY_URL`, default
`http://localhost:3000`) and reads them back.
