# Estiva Ship, for Claude Code

A minimal issue tracker — projects, issues, comments — built on Nostr.
`README.md` explains the design.

This app reads and writes **production**, `estiva.estiva.app`. There is no
staging workspace.

**Display refs are not unique.** The workspace holds two `PEE-1`, two `NEW-1`
and two `TES-1`. The address is the identity; the ref is decoration. Use the
`addr` when you must be sure it is the same object.

**The UI Guardrails project:** where it stands is `docs/GATES.md` §0 in the `estiva-ui` checkout beside this repository.
`npm run gates:status` here shows Ship's part of it, read from the code.

## One package, laid out as Peek is

One `package.json` and one lockfile, at the top folder (PER-19). The app is
`src/` — React + Vite + Tailwind, with `@estiva-app/ui` for the primitives —
and Ship's data layer (kinds, event builders, the fold, `Store`) is
`src/nostr/`, where Peek keeps its own. `scripts/` holds the `tsx` scripts:
the data layer's tests, the smoke test, the probes.

```bash
npm run typecheck && npm run test:scripts   # tsc -b; the tsx tests in scripts/
npm test && npm run build                   # Vitest over src/; tsc -b && vite build
```

They need no credentials and no network. `npm run build` writes `dist/ship`,
which is exactly what the image serves.

## The gate lint, and a session opened in another folder

A raw interactive element, behaviour a package part already owns written by
hand, and a look passed into a package part are refused — the message names
the package part to use — by `npm run lint:rules`, by CI's `gate`
job, and before the write by the package's editor hook, which
`.claude/settings.json` runs. That hook runs only in a Claude session started
in this folder, the repository's top folder. A session started anywhere else
(a workspace holding several repositories) does not get the hook,
so: after changing any `.ts` or `.tsx` under `src/`, run
`npm run lint:rules` and fix everything it reports before you
finish.

## Where the rest lives

- **`.claude/skills/estiva-ui/`** — the package's skill. Loads before any
  work on screen: search with `npm run ui:find <what it does>`,
  read the part's page, the mistakes this codebase keeps making.
- **`.claude/rules/ship-ui.md`** — loads when you open a file under
  `src/` or `scripts/smoke.ts`: Ship's three kinds of UI file, forks,
  links through `linkTo`, tables, empty states, the page contract, the
  smoke test's selectors.
- **`.claude/rules/wire-and-fold.md`** — loads when you open a file under
  `src/nostr/`, `conformance/` or `scripts/conformance.test.ts`: the
  copies `estiva-agent` keeps, the conformance fixture, how `loadAll` reads.
- **`.claude/skills/verify/`** — when you check a change by looking:
  Storybook on `:6007`, measuring against the package, `npm run smoke`.
- **The lint** holds the rest, and each message says what to use. All of it
  runs in CI's `gate` job, which merging to `main` needs:
  - `npm run lint` — tokens (no Tailwind defaults, no raw
    colours, no unknown class), plus the gate rules;
  - `npm run lint:rules` — the gate rules alone, and the escape
    count;
  - `npm run registry:check` — every part has its one-line
    `/** … */` comment.
