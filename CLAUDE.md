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
  manifest as the contract `estiva-agent` and Peek read by, the conformance
  fixture, how `loadAll` reads.
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

## Tests: house rules

Read these before writing or changing a test (agent or person). `/land`'s code
reviewer checks every new test in a PR against them (PEE-50, UNI-4).

- **Test what a person or the relay sees**: the rendered text, the enabled
  control, the event that goes on the wire, the row a reader gets back. Not how
  the code arrives there.
- **No tests of** constants, CSS class names, re-exports, type shapes, or
  debugging instruments (a `console.log` or a probe hook). They pass on a broken
  feature and fail on a harmless rename.
- **Fake timers, never real sleeps.** `vi.useFakeTimers()` and advance the clock;
  no `setTimeout` waits, no `sleep(…)`. Real waits fail under load and hide
  races.
- **Test writes at the wire.** A send, edit, delete or membership change is
  asserted on the signed event that would reach the relay (kind, tags, content,
  signer), not on a mocked helper being called.
- **A new test must fail on the bug it is for.** Run it on the code before your
  change: it must fail on an assertion, not on a missing import or a timeout.
  `/land` runs the same check (`old-code-check.mjs`) and, on a PR touching read
  state, access, membership or the wire, plants bugs in the changed lines
  (`plant-check.mjs`); a planted bug no test catches means a test is missing.
- **Mocking a module the code relies on is a decision.** If a test mocks a module
  (for example Ship mocks `./nip44`), something else must cover that module's own
  contract.
- **A test says what it guards**: its name states the behaviour and the case, so
  a red run reads as a real bug.
