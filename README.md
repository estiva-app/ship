# Linear-lite

A deliberately minimal issue tracker — **projects, issues, comments** — built on
Nostr as the second real app in the Nostr for Business ecosystem.

The point is not the tracker. The point is proving that **two apps built by
different people, sharing no code and no database, can work on the same data** —
and that one app can render and act on another app's objects using only a
published manifest.

## Read first

The spec and the reasoning behind it live in the Peek repo:

| Document | What it gives you |
| --- | --- |
| **`~/peek-app/docs/buzz-compat/LINEAR_LITE_SPEC.md`** | **The spec. Start here.** Objects, kinds, the manifest, build order |
| `~/peek-app/docs/buzz-compat/RFC_UPDATES.md` | Why the design is shaped this way — Folders, event-sourced records, the projection principle |
| `~/peek-app/docs/buzz-compat/FRICTION.md` | Things that broke in practice. Read §A before debugging anything |
| `~/peek-app/docs/buzz-compat/RUNNING.md` | How to start the relay and the rest of the stack |

## What is already here

`lib/nostr/` — a working, tested protocol library, copied from `~/nfb-demos`:

- `events.ts` — event builders, NIP-01 id computation. Verified byte-identical to
  Buzz's own Rust SDK
- `sign.ts` — BIP-340 Schnorr signing
- `nip98.ts` — HTTP auth for the relay bridge
- `relay.ts` — publish and query

**Read the comments in these files.** They record behaviours that cost real
debugging time — the NIP-98 nonce requirement, `HTTP 200` not meaning accepted,
`/query` taking a bare array. None of it is guessable.

The duplication from `~/nfb-demos` is deliberate: apps in this ecosystem are meant
to be independent implementations, not siblings sharing a package.

`src/` — Linear-lite's own data layer:

- `kinds.ts` — the three kinds and the status vocabularies. The vocabularies get
  published verbatim in the manifest at build-order step 3
- `events.ts` — builders for Project (30850), Issue (30851) and Change (1851)
- `fold.ts` — root + change events → current state. Read the comment on
  `orderingMs` before touching the ordering rule
- `store.ts` — publish and read against the relay. No cache, deliberately

`apps/linear-lite/` — the UI. Plain DOM, no framework.

`scripts/` — `probe-kinds.ts` asks the relay which kinds it will accept;
`verify.ts` is the end-to-end check that Ravi can close Ana's issue.

## What is not here

The manifest. That is build-order step 3.

## Running

Needs a Buzz relay on `:3000` — see `RUNNING.md` above.

```bash
npm install
npm run serve      # builds and serves dist/ on :5190
```

Then open **http://localhost:5190/linear-lite/**, click *New Folder*, and create
a project.

```bash
npm run typecheck  # tsc --noEmit
npm run probe      # does the relay accept our kinds?
npm run verify     # full round trip against the relay, two identities
```

## The fold, in one paragraph

An Issue's root event carries only immutable facts — title, Folder, parent
project. Status and assignee are **not** on it. They are `kind:1851` change
events authored by whoever acts, and current state is those changes replayed in
order, last write per field wins. This is not a stylistic choice: NIP-33
addresses are `(pubkey, kind, d)`, so only an author can replace their own
event, and "Ana opens an issue, Ravi closes it" is otherwise inexpressible. The
activity feed is the same stream, unmodified.

One thing that cost real debugging time and is now pinned by `verify.ts`:
`created_at` is in **seconds**, and five changes in a row from one client land
in the same second, so ordering by `created_at` alone silently returns a stale
status. Changes carry a provisional `ts` tag in milliseconds, honoured only when
it agrees with `created_at` to the second. See `FRICTION.md` A6.

## The one thing that will stop you

**The relay allowlists event kinds.** Anything Buzz does not already know is
rejected at ingest with no useful error. Adding a kind is two files in
`~/buzz`:

- `crates/buzz-core/src/kind.rs` — a constant plus an `ALL_KINDS` entry
- `crates/buzz-relay/src/handlers/ingest.rs` — one `required_scope_for_kind` arm

Then rebuild (`cargo build -p buzz-relay`) and restart. There are two prior
patches on the `nfb-demo-kinds` branch to copy the shape from.

This applies to **ratified NIPs too** — NIP-89 and NIP-22 are standard and Buzz
still rejects them.

**This is already done** for the six kinds Linear-lite needs, in two commits on
`nfb-demo-kinds`: one for the ratified kinds (1111, 31989/31990), which is
upstreamable on its own, and one for the provisional ones (30850/30851/1851).
`npm run probe` will tell you whether the relay you are pointed at has them.

Two things those patches decide, beyond registering the numbers:

- **31989/31990 are global**, not channel-scoped. Discovery has to work before
  you are a member of anything.
- **30850/30851/1851 require `h`** at ingest. The Folder is not optional, and
  since several apps write these kinds, one of them forgetting would put an
  unreachable object into the shared space that nobody can unpublish.
