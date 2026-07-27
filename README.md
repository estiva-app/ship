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

## What is not here

Everything else. No UI, no data layer, no manifest. That is the work.

## Running

Needs a Buzz relay on `:3000` — see `RUNNING.md` above.

```bash
npm install
npm run serve      # builds and serves dist/ on :5190
```

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
