# Estiva Ship, for Claude Code

A minimal issue tracker — projects, issues, comments — built on Nostr.
`README.md` explains the design.

This app reads and writes **production**, `estiva.estiva.app`. There is no
staging workspace.

**The UI Guardrails project:** where it stands is `docs/GATES.md` §0 in the `estiva-ui` checkout beside this repository.
`npm run gates:status` here shows Ship's part of it, read from the code.

**The gate lint, and a session opened in another folder.** A raw interactive
element (a `<button>`, an `<input>`, a `<form>`, a link…), behaviour a
package part already owns written by hand (a Base UI import, `createPortal`, a
click or key listener on the whole page, arrow keys compared by hand, a
hand-written `role` such as `option` or `alert`, `tabIndex` 0 on a box,
`overflow-auto`), and a look passed into a package part through `className`
or an inner box's class prop (a colour, a text size, a border, a corner, a
shadow — only space, size, flex and grid, and position pass in; `EmptyState`
takes no padding; a look for what is around a part goes on your own element
around it) are refused — the message names the package part to use, or
says there is none yet — by `npm --prefix web run lint:rules`, by CI's "Gate
lint", and before the write by the package's editor hook, which
`.claude/settings.json` runs — but that hook runs
only in a Claude session started in this folder, the repository's top folder. A
session started anywhere else (a workspace holding several repositories, or
`web/`) does not get the hook, so: after changing any `.ts` or `.tsx` under
`web/src/`, run `npm --prefix web run lint:rules` and fix everything it reports
before you finish. Keep one only with its reason on the line above,
`// @estiva-escape: <reason>` or `{/* @estiva-escape: <reason> */}`, never with
`eslint-disable`.

## UI: the shared package, and the rules every session follows

@UI-RULES.md

Every piece of UI in this app comes from `@estiva-app/ui`, or wraps it with
what only Ship knows, or draws a product object nothing else has. There is no
fourth kind. Before you write a component, a class list or a colour:

1. `UI-RULES.md`, imported above, is already in your context. Act on it, all
   of it.
2. Read `web/node_modules/@estiva-app/ui/src/<Component>.mdx` for how to use a
   component, and `Choosing.mdx` to pick one (in the `estiva-ui` checkout
   beside this repository under `stories/`, or the package Storybook on
   `:6008`). Do not use a component you have not read the page of.
3. Look in `web/src/components/ui/` for the shim or wrapper this app already
   has.

Never hand-write a popup, a menu, a dialog, a tooltip, keyboard navigation,
outside-click or focus handling, or a form control. Never use a Tailwind
default size or colour (`text-sm`, `bg-gray-100`), a hex value, an opacity
modifier on a token (`bg-bg-inset/40`), or a class the preset does not define:
the token classes are doubled, `bg-bg-surface` and `text-text-primary`, and
`bg-surface` compiles to nothing. Until the lint that fails the build on these
lands, prove a class exists by building the CSS (`UI-RULES.md` §4).

If the component you need is missing or nearly fits: extend the package (a
ticket in `estiva-ui`, a prop added there), never a fork here. A fork without a
ticket is a defect. Every UI file has a story; a file without one is unreviewed
and is treated as broken until it has one.

## The app is `web/`, and nothing at the root tests it

Two package.json files. The root holds the shared wire and fold code — `src/`,
`lib/nostr/`, `scripts/` — and `web/` holds the app: React + Vite + Tailwind,
with `@estiva-app/ui` for the primitives. The vanilla-DOM app that used to live
in `apps/` was deleted in REW-9 once the React app had served production; it is
in git history.

**The trap is that the root's checks look complete and are not.** `npm run
typecheck` is `tsc --noEmit` over `["lib", "src", "scripts"]`, and root `npm
test` runs the tsx scripts covering those. Neither sees a single line of the app.
So the root suite can be entirely green while nothing a person can see has been
compiled — which is why CI has a separate `web` job and why `publish` requires
it. Run both:

```bash
npm test && npm --prefix web run test
npm run typecheck && npm --prefix web run build   # web's build IS its typecheck: tsc -b
```

There is deliberately no `npm run build` at the root any more. It was
`node build.mjs`, the vanilla app's bundler, and the only build that exists now
is `web/`'s — it writes `../dist/ship`, which is exactly what the image serves.

Two smaller things the rewrite settled, both easy to undo by accident:

- **`data-surface` and `data-view` on the four views are load-bearing.** They are
  `scripts/smoke.ts`'s only non-semantic selectors, present because "which
  surface is on screen" is not expressible as a role. Everything else that test
  clicks it finds by role and accessible name, on purpose — a class-name
  selector proves nothing about whether a person using a screen reader can get
  there.
- **Comments across `web/src/` cite `apps/ship/*` paths** as the provenance of
  ported behaviour ("copied from the old app's `ago()`"). Those files no longer
  exist. The references are kept because they say *why* the code is shaped as it
  is, and git still has them; do not "fix" them by deleting the reasoning.

## The agent lives in `estiva-agent` now

Reading this workspace from Claude Desktop, Claude Code or a terminal is
[`estiva-app/estiva-agent`](https://github.com/estiva-app/estiva-agent). It used
to live here, because that is where `lib/nostr/`, `Store` and `foldFolder`
already were — gravity rather than a decision, and it ended with Ship's
repository holding Peek's kinds and Ship's CI holding an opinion about Peek's
wire format (PEEK-155).

Nothing in this repository depends on it. It depends on this one, by copy.

## The copies that must not drift

`estiva-agent` vendors `src/` and `lib/nostr/` from here, at identical paths, so
`diff -r` is a check anybody can run:

```bash
diff -r src ../estiva-agent/src
diff -r lib/nostr ../estiva-agent/lib/nostr
```

Duplication is the deliberate choice — the same argument `README.md` already
makes for duplicating the protocol library rather than sharing a package. What
it risks is this app and the agent disagreeing about what the workspace says,
which is the one thing neither may do.

`scripts/conformance.test.ts` is the automated half and is **byte-identical in
both repositories**. It folds `conformance/fold-fixture.json` — real production
events plus deliberately adversarial ones — and compares against a recorded
state. If a change to `src/fold.ts` here alters the result, this repo's CI
fails; if the agent's copy drifts, theirs does.

**If it fails, do not regenerate the fixture.** A failure means the two repos
disagree, and regenerating erases the finding rather than fixing it.
Regenerating is correct only when the fold must cover a shape of event nobody
had recorded before, and then the fixture *and* the `EVENTS_SHA256` constant
have to land in both repositories. The generator lives in `estiva-agent`.

Worth knowing why the fixture contains synthetic events at all: recorded from
production alone, it passed unchanged when the `ts` trust window in
`orderingMs` was widened from one second to five. Every recorded change carried
a `ts` and none was outside the window. A healthy workspace contains no event
trying to make its write always win, so the rules the fold is most careful about
are exactly the ones production cannot demonstrate.

## Two things that will mislead you

**The app used to miss issues, and no longer does — SHI-7, 2026-08-24.**
`loadAll` discovered only from projects and widened into their Folders, so an
issue whose project record no longer resolved was never asked for: 13 unreachable
of 97 on production. It now also queries `kind:30851` directly **and widens into
each discovered issue's own Folder**, which takes coverage to 0 of 97.

Both halves matter and the second is the one to protect. An issue root carries no
status and no assignee — both are `kind:1851` changes living in the issue's
Folder — so discovering an issue without widening into it folds a *default*
status. Two of the thirteen are `done` and assigned and would read `todo`. A
missing row is noticed; a wrong status is believed.

The `coverage` block in `estiva-agent` stays and is still worth reading. It
reported 13 because of this defect; at 0 it now measures the real case — an issue
in a Folder the reader genuinely cannot read. Production has no private channel
today (all 50 are open), so that has never happened here. It will.

History, because the diagnosis was wrong for a while: PEEK-154 and PEEK-150 read
this as an access-control problem, and REW-11 was justified partly on fixing it.
It was not access. Twelve of the thirteen had a project record that was
**deleted**, one never carried an `a` tag, and all thirteen sat in Folders the
reader could already see — so REW-11 measured 13 before and 13 after.

**Display refs are not unique.** `nextRef` derives them from what a client could
see at the time, so the workspace contains two `PEE-1`, two `NEW-1` and two
`TES-1`. The address is the identity; the ref is decoration. Prefer the `addr`
when you need to be sure you are talking about the same object twice.

## Cost

`loadAll` pulls up to 2000 events and folds them on every call — no cache, by
design.

### Tests

```bash
npm test                                # the shared code, offline
npm --prefix web run test               # the app, offline
npx tsx scripts/conformance.test.ts     # this app still agrees with estiva-agent
npm run smoke                           # builds web/ and drives it in chromium
```

The first three need no credentials and no network. `npm run smoke` needs
chromium's system libraries, which Playwright does not bundle — that is why CI
does not run it, and why it is worth running by hand before anything that
touches a surface.
