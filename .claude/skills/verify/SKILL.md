---
name: verify
description: Use when you check a change to Ship's screens by looking at it (Storybook on :6007, measuring against the package part, `npm run smoke`) before you call it done.
---

# Verifying Ship changes by looking

"It looks right" is not a result. Say what you measured, not what you saw.

## Render it and measure it

- Start Ship's Storybook: `npm --prefix web run storybook` → `http://localhost:6007`.
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

- `npm run smoke` builds `web/` and drives it in chromium, against an
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
