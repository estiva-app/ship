---
paths:
  - "src/nostr/**"
  - "scripts/conformance.test.ts"
  - "conformance/**"
---

# The shared wire and fold code

## The agent lives in `estiva-agent`

Reading this workspace from Claude Desktop, Claude Code or a terminal is
[`estiva-app/estiva-agent`](https://github.com/estiva-app/estiva-agent), not
this repository.

Nothing in this repository depends on it. It depends on this one, by copy.

## The copies that must not drift

`estiva-agent` vendors Ship's data layer, `src/nostr/`. Since PER-19 it no
longer sits at the same path in both repos: the agent still keeps it as `src/`
plus `lib/nostr/signer.ts`, until PER-21 replaces the copy altogether
(conversations from `@estiva-app/conversation`, PER-20; Ship's objects through
its manifest and `@estiva-app/interop`). Until then the check is:

```bash
diff -r -x signer.ts src/nostr ../estiva-agent/src
diff src/nostr/signer.ts ../estiva-agent/lib/nostr/signer.ts
```

`scripts/conformance.test.ts` differs by one import line for the same reason.

Do not assume they match: on 2026-09-24, `attachments.ts`, `edits.ts`,
`events.ts` and `store.ts` differed between the two `main` branches — the
agent's copy predates CON-5, FOL-30, FOL-2 and PER-17.

Duplication is the deliberate choice — the same argument `README.md` already
makes for duplicating the protocol library rather than sharing a package. What
it risks is this app and the agent disagreeing about what the workspace says,
which is the one thing neither may do.

**If `scripts/conformance.test.ts` fails, do not regenerate the fixture.** A
failure means the two repos disagree, and regenerating erases the finding
rather than fixing it. Regenerating is correct only when the fold must cover a
shape of event nobody had recorded before, and then the fixture *and* the
`EVENTS_SHA256` constant have to land in both repositories. The generator lives
in `estiva-agent`.

Worth knowing why the fixture contains synthetic events at all: recorded from
production alone, it passed unchanged when the `ts` trust window in
`orderingMs` was widened from one second to five. Every recorded change carried
a `ts` and none was outside the window. A healthy workspace contains no event
trying to make its write always win, so the rules the fold is most careful about
are exactly the ones production cannot demonstrate.

## How `loadAll` reads

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

`loadAll` reads everything with `queryAll`, which pages on the `until` cursor
(no fixed limit), and folds on every call — no cache, by design.
