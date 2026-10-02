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

Nothing in this repository depends on it, and since PER-21 (estiva-agent#68,
2026-10-02) it holds no copy of this one either. It reads Ship the way Peek
does: **Ship's published manifest** (`src/nostr/manifest.ts`, republished as
`31990:88ac6aae…:estiva-ship`), folded by `@estiva-app/interop`, with every
write one of the manifest's declared actions.

## So the manifest is the contract

What the agent and Peek show about a project or an issue is what the manifest
declares, not what `fold.ts` does. A rule the fold applies and the manifest does
not state is a rule only Ship follows — an issue title the slot did not `fold`
showed every renamed issue by its first title in Peek until ship#231. When the
fold changes, the manifest changes in the same PR, and is **republished** after
it merges (`npm run manifest`); the agent re-records its copy of the
event with its `scripts/record-ship-manifest.ts`.

**`scripts/conformance.test.ts` runs in both repositories over the same
`conformance/fold-fixture.json`.** Here it folds the events with `foldFolder`;
in `estiva-agent` the same events go through the agent's real read path —
the recorded manifest and interop — and both must equal the fixture's
`expected`. A failure there means the manifest and this fold disagree.

**If it fails, do not regenerate the fixture.** Regenerating erases the finding
rather than fixing it. Regenerating is correct only when the fold must cover a
shape of event nobody had recorded before, and then the fixture *and* the
`EVENTS_SHA256` constant land in both repositories. The generator is not in
either tree: it was the agent's `scripts/make-conformance-fixture.ts`, deleted
with the copy (`git -C ../estiva-agent show d5e39b7:scripts/make-conformance-fixture.ts`).
It records production through a `Store` and an agent credential, so reviving it
means pointing it at this repo's `src/nostr/` and a credential.

When the fold's rules change **on purpose**, re-record only `expected` with
`npx tsx scripts/refresh-expected.ts conformance/fold-fixture.json` — it checks
the events stayed byte-identical — and land the same file in `estiva-agent`.
PER-21 did that once: a same-millisecond tie now goes to the higher id and a
`ts` is trusted only inside its own second (SPEC §6.2–6.3), the rules
`@estiva-app/interop` folds by for every manifest reader.

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
