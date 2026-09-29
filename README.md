# Estiva Ship

A deliberately minimal issue tracker — **projects, issues, comments** — built on
Nostr as the second real app in the Nostr for Business ecosystem.

The point is not the tracker. The point is proving that **two apps built by
different people, sharing no code and no database, can work on the same data** —
and that one app can render and act on another app's objects using only a
published manifest.

## Reading it from Claude

Claude Desktop and Claude Code can read this workspace through a local MCP
server that signs as an Estiva ID service identity — read-only, holding no key.
Reading this workspace as an agent is [estiva-agent](https://github.com/estiva-app/estiva-agent).

## Read first

The spec and the reasoning behind it live in the Peek repo:

| Document | What it gives you |
| --- | --- |
| **`~/peek-app/docs/buzz-compat/LINEAR_LITE_SPEC.md`** | **The spec. Start here.** Objects, kinds, the manifest, build order |
| `~/peek-app/docs/buzz-compat/RFC_UPDATES.md` | Why the design is shaped this way — Folders, event-sourced records, the projection principle |
| `~/peek-app/docs/buzz-compat/FRICTION.md` | Things that broke in practice. Read §A before debugging anything |
| `~/peek-app/docs/buzz-compat/RUNNING.md` | How to start the relay and the rest of the stack |

## What is already here

One package, laid out as Peek is (PER-19): `package.json`, `vite.config.ts` and
the rest of the app's config at the top folder, the app in `src/`.

The wire format — event builders, NIP-01 ids, signing, NIP-98, the relay
clients — is `@estiva-app/protocol` since SHA-3. **Read the comments there.**
They record behaviours that cost real debugging time — the NIP-98 nonce
requirement, `HTTP 200` not meaning accepted, `/query` taking a bare array. None
of it is guessable.

`src/nostr/` — Ship's own data layer, where Peek keeps its own:

- `kinds.ts` — the three kinds and the status vocabularies. The vocabularies get
  published verbatim in the manifest at build-order step 3
- `events.ts` — builders for Project (30850), Issue (30851) and Change (1851)
- `fold.ts` — root + change events → current state. Read the comment on
  `orderingMs` before touching the ordering rule
- `store.ts` — publish and read against the relay. No cache, deliberately.
  `loadAll` is the discovery read described below
- `profiles.ts` — `kind:0` in, people out. Not Ship's own idea of a user:
  the names and avatars here were mostly written by Peek, about people who have
  never opened this app. Neither app has the other's user table and both read
  the same profiles, which is the whole of cross-app identity
- `signer.ts` — the app's signers over protocol's `Signer`: Estiva ID, a
  per-browser key, NIP-07

The rest of `src/` is the app. React + Vite + Tailwind, with `@estiva-app/ui`
for the shared primitives. `src/router.ts` is path routing, `src/pages/` wires
each surface to the data, `src/views/` is the surface itself, `src/api/` is the
one seam onto `src/nostr/`.

There is no `apps/` any more: the vanilla-DOM app it replaced was deleted in
REW-9, after the React app had served production. It is in git history if you
need to see what a behaviour used to do.

`scripts/` — `probe-kinds.ts` asks the relay which kinds it will accept;
`verify.ts` is the end-to-end check that Ravi can close Ana's issue;
`app.test.ts` pins the things that fail silently; `smoke.ts` builds the app and
drives it in a real browser against an in-memory relay.

## The Folder *is* the project

This is the one structural thing to understand before reading any of it.

A project *is* a Folder. Its issues, their change events and its conversation
all carry that Folder as their `h`. There is nothing above it.

The record itself is the exception, and deliberately so (REW-11): it carries no
`h` at all and names its Folder with `buzz-channel` instead. A channel-scoped
event is only readable by someone who already knows the channel, so a record
filed inside its own Folder could not be discovered by anyone who had not
already been told where to look. Global, it answers a plain `kind:30850` query.

| Event | scope |
| --- | --- |
| `30850` Project | **global**, naming its Folder with `buzz-channel` |
| `30851` Issue | `h` = the project's Folder |
| `1851` change to either | `h` = the same Folder |
| `1111` comment on either | `h` = the same Folder |

**There is no workspace object, deliberately.** Buzz already answers "what is
the organisation", and the answer is not an event: a *community* is resolved
from the request host before a connection is authenticated, so **the relay URL
is the workspace** (`~/buzz/ARCHITECTURE.md` §1 and §3 Step 0). Everyone pointed
at the same relay is in the same workspace, in every app in the ecosystem. An
index Folder invented here would be a second, app-private notion of the same
thing — invisible to Peek, which is precisely the failure this project exists to
argue against.

So projects are **discovered, not indexed**: `store.loadAll` asks the relay for
`kind:30850` with no `#h` at all and lets access control decide what comes back.
A project in a Folder you are not a member of, and which is not open, simply is
not there.

Two consequences worth knowing:

- **A project is filed into a top-level Folder, and that is the whole
  placement** (FOL-2, FOL-3). Its issues and conversation live in that Folder,
  and the Folder's state lists it, which is what both apps draw it under.
  There is no pairing step and no control for one. `store.linkProjectFolder`
  survives only to repair a record that points at the wrong Folder — an event
  cannot change its own `h` — and readers take the union of every Folder a
  project has pointed at, so the projects re-linked before this still list
  every issue.
- **An issue cannot exist without a project**, because the only Folders in this
  app are projects and every event needs an `h`.

## Conversations

Ship does not have its own comment kind. A conversation is a **`kind:9`**
— the same NIP-29 stream message Peek writes for a topic message — posted into
the project's Folder.

That is the whole integration, and it needed no new protocol. A project is a
Folder and a Peek topic is that Folder, so a conversation on the project and a
conversation in the topic are *one event read twice*, not two records to
reconcile. Peek's sync already imports a foreign pubkey's root message as a
conversation and one carrying an `e` tag as a reply, so a thread started here
appears there with no change on Peek's side.

| | |
| --- | --- |
| No `e` tag | a root message — starts a conversation |
| `['e', root, '', 'reply']` | a reply in that conversation |
| `a` tag | the Issue or Project the thread is about |
| `nostr:naddr…` in the body | the same thing, as a person types it in Peek |

**A thread belongs to whatever anyone in it referenced, at any point.** A
discussion that mentions an issue halfway through is, from then on, about that
issue — and the earlier messages are the context somebody needs, so the whole
thread attaches, not just the message carrying the reference.

Threads appear in **both** places: on the project *and* under the issue they
mention. Duplicated on purpose — hiding a thread from the project because it
mentions an issue only makes people wonder where it went.

Ship appends the issue's `nostr:naddr` when you start a thread about one,
so Peek renders the issue's widget above the message rather than showing a bare
line with nothing saying what it refers to. The reference is stripped when
displayed here.

Messages carry `ts` for the same reason change events do: `created_at` is
seconds, and two messages in one second read back in the wrong order. In a
conversation that is not a subtle bug, it is an unreadable exchange.

## Archiving vs deleting

Two operations with genuinely different reach, which is why they are not two
styles of the same button.

**Archive** is a `kind:1851` on an `archived` field. Reversible, attributable,
and available to anyone in the Folder — measured: a non-author can archive
somebody else's project and the feed says who did it. It hides the project from
the navigation and the active list, nothing more.

**Delete** is a NIP-09 `kind:5`, and three things about it are load-bearing:

- It is a **request**. Relays may decline; a copy held elsewhere is untouched.
  Buzz accepts and honours it, so the record does stop coming back.
- It is **author-scoped**. A relay honours a deletion only from the pubkey that
  signed the original — verified: Ravi's attempt to delete Ana's project has no
  effect. So the control is absent for everyone but the author rather than
  present and failing.
- It removes the **record**, not the work. Issues are separate events with their
  own authors; they stay in the Folder and simply stop being reachable from here
  once the project they hung off is gone.

All four properties are pinned in `npm run verify`.

## Running

Needs a Buzz relay on `:3000` — see `RUNNING.md` above.

```bash
npm install
npm run dev        # Vite on :5191, with hot reload
```

Then open **http://localhost:5191/** and add a project. It gets its
own Folder; the *Folder* panel on the project's page is what you paste into Peek
to pair a topic with it — or paste a topic's Folder link when creating the
project, and they are the same container from the start.

```bash
npm run typecheck     # tsc -b: the app, and src/nostr + scripts/ more strictly
npm run test:scripts  # pure logic: Folder placement, the manifest, profiles
npm test              # the app: components, pages, router, auth boot
npm run build         # tsc -b && vite build → dist/ship
npm run probe      # does the relay accept our kinds?
npm run verify     # full round trip against the relay, two identities
npm run manifest   # publish the NIP-89 manifest and check it is satisfiable
npm run smoke      # drive the UI in chromium against an in-memory relay
```

`npm run smoke` needs chromium's system libraries, which Playwright does not
bundle:

```bash
sudo npx playwright install-deps chromium
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

**This is already done** for the six kinds Ship needs, in two commits on
`nfb-demo-kinds`: one for the ratified kinds (1111, 31989/31990), which is
upstreamable on its own, and one for the provisional ones (30850/30851/1851).
`npm run probe` will tell you whether the relay you are pointed at has them.

Two things those patches decide, beyond registering the numbers:

- **31989/31990 are global**, not channel-scoped. Discovery has to work before
  you are a member of anything.
- **30850/30851/1851 require `h`** at ingest. The Folder is not optional, and
  since several apps write these kinds, one of them forgetting would put an
  unreachable object into the shared space that nobody can unpublish.
