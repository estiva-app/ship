# Estiva Ship, for Claude Code

A minimal issue tracker — projects, issues, comments — built on Nostr.
`README.md` explains the design.

This app reads and writes **production**, `estiva.estiva.app`. There is no
staging workspace.

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
npm test                                # everything offline
npx tsx scripts/conformance.test.ts     # this app still agrees with estiva-agent
```

`npm test` needs no credentials and no network.
