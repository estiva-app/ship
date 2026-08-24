/**
 * Event builders for Estiva Ship's three kinds.
 *
 * Same discipline as `lib/nostr/events.ts`: pure functions, no I/O, no
 * randomness, so the shapes are unit-testable and the caller owns identity and
 * timing.
 *
 * Tag order is fixed per builder and matches LINEAR_LITE_SPEC.md §1. It is part
 * of the NIP-01 id preimage, so reordering a tag changes the event id.
 */
import {
  addr,
  buildMessage,
  threadTags,
  toNostrSeconds,
  type NostrTag,
  type ThreadRef,
  type UnsignedEvent,
} from '../lib/nostr/events'
import { KIND } from './kinds'

/**
 * The Folder id.
 *
 * The relay advertises `"h_grammar": "uuid-v4-lowercase"` in its NIP-11
 * document, and `extract_channel_id` parses the `h` tag with `Uuid::parse_str`
 * — anything else silently yields *no* channel rather than an error, which then
 * surfaces much later as a confusing membership failure. Validate at the door.
 */
export function assertFolderId(folder: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(folder)) {
    throw new Error(`folder must be a lowercase UUID v4, got: ${folder}`)
  }
}

/**
 * kind:30850 Project. Tag order: d, title, h, [lead].
 *
 * ## The Folder *is* the project
 *
 * A project's `h` is its own Folder — the same container its issues, their
 * change events and its conversation live in. That is the whole model, and it
 * is what RFC_UPDATES.md §1.1 already described: "the Peek topic and the Linear
 * project are the same Folder, projected differently."
 *
 * There is deliberately **no workspace Folder** above this. Buzz already has an
 * answer for "the organisation" and it is not an event: a *community* is
 * resolved from the request host, so the relay URL is the workspace
 * (`ARCHITECTURE.md` §1, §3 Step 0). An index Folder invented here would be a
 * second, app-private notion of the same thing — invisible to every other app,
 * which is exactly what this ecosystem is trying not to do. Projects are found
 * by asking the relay for `kind:30850`; access control decides what comes back.
 *
 * Pairing with an existing Peek topic is therefore just *creating the project
 * in that topic's Folder*. No linking step, no second container.
 *
 * `folder` is written as a foldable **field** only when a project is later
 * re-pointed at a different Folder (`store.linkProjectFolder`). An event cannot
 * change its own `h`, so that override is the only way to express "this project
 * now lives in that topic" after the fact — and the reader takes the union, so
 * issues already filed do not disappear.
 *
 * ## Why this still writes `h` and `title` (REW-11)
 *
 * REW-11 replaces `["h", uuid]` with `["buzz-channel", uuid]` and `["title"]`
 * with `["name"]` + a `["description"]` tag, so the record becomes global and
 * discoverable without channel access. `src/fold.ts` **already reads that
 * shape** — see `projectFolder`, `projectName`, `projectDescription`.
 *
 * The writer has not flipped because the relay refuses the result. Buzz lists
 * `KIND_LL_PROJECT` in `requires_h_channel_scope`
 * (`buzz-relay/src/handlers/ingest.rs:494`) alongside `KIND_LL_ISSUE` and
 * `KIND_LL_CHANGE`, so a `kind:30850` with no `h` comes back
 *
 *   200 {"accepted": false, "message": "invalid: channel-scoped events must
 *        include an h tag"}
 *
 * — measured against production, not inferred, and a 200 with `accepted:false`
 * is exactly the rejection shape `lib/nostr/relay.ts` exists to catch. The
 * comment on that list says the Folder is required because it is "both how
 * objects are grouped and how access is enforced", which is true of an issue
 * and is the thing REW-11 argues is wrong for a *project record*.
 *
 * So the flip needs `KIND_LL_PROJECT` removed from that one list and the relay
 * deployed. Issues and changes stay on it — only the record goes global. When
 * that lands, this builder emits
 *
 *   [["d", id], ["name", …], ["description", …], ["buzz-channel", folder]]
 *
 * with `lead` unchanged and `d` still an opaque uuid (RFC 0.3 §4.3: a human
 * slug in an immutable address leaks a name you may later want private). No
 * reader change is needed at that point, which is the whole reason the reader
 * went first.
 */
export function buildProject(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** Stable project id — the `d` tag. */
    projectId: string
    title: string
    /** The project's Folder. Its issues and conversation live here too. */
    folder: string
    /** Optional pubkey of the project lead. */
    lead?: string
    /** Free-text description. */
    description?: string
  },
): UnsignedEvent {
  assertFolderId(args.folder)
  const tags: NostrTag[] = [
    ['d', args.projectId],
    ['title', args.title],
    ['h', args.folder],
  ]
  if (args.lead) tags.push(['lead', args.lead.toLowerCase()])
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.PROJECT,
    tags,
    content: args.description ?? '',
  }
}

/**
 * kind:30851 Issue — the root event. Tag order: d, title, h, [a], [ref].
 *
 * Note what is **not** here: status and assignee. Those are `1851` changes, so
 * that somebody other than the author can set them. Putting them on the root
 * would make the issue rewritable only by its creator, which is the wrong shape
 * for a tracker (LINEAR_LITE_SPEC.md §1.3).
 */
export function buildIssue(
  pubkey: string,
  createdAtMs: number,
  args: {
    issueId: string
    title: string
    folder: string
    /** Parent project address, `30850:<pubkey>:<d>`. Optional — issues can be loose. */
    projectAddr?: string
    /** Display-only key such as `LL-12`. Never used for addressing. */
    ref?: string
    description?: string
  },
): UnsignedEvent {
  assertFolderId(args.folder)
  const tags: NostrTag[] = [
    ['d', args.issueId],
    ['title', args.title],
    ['h', args.folder],
  ]
  if (args.projectAddr) tags.push(['a', args.projectAddr])
  if (args.ref) tags.push(['ref', args.ref])
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.ISSUE,
    tags,
    content: args.description ?? '',
  }
}

/**
 * kind:1851 Change — sets one field on one object. Tag order: a, field, value, h, ts.
 *
 * Authored by **whoever acts**, not by the object's author. That asymmetry is
 * the reason this kind exists: NIP-33 addresses are `(pubkey, kind, d)`, so Ana
 * creating an issue and Ravi closing it cannot be expressed as an edit — Ravi
 * has no way to replace Ana's event. It can be expressed as Ravi's own event
 * pointing at Ana's.
 *
 * One field per event, deliberately. Two fields in one event would need a
 * conflict rule for partial application; one field per event needs none.
 *
 * ## The `ts` tag — provisional, and load-bearing
 *
 * `created_at` is **seconds**, and the fold is last-write-wins per field, so two
 * changes to the same field inside one second are unorderable. That is not the
 * rare case LINEAR_LITE_SPEC.md §7.4 anticipated ("two people in the same
 * second"): measured against the live relay, five sequential changes from a
 * *single* client all landed in one `created_at` second. Ordering them by event
 * id is stable but arbitrary, so the fold reported a status the user had
 * already moved past.
 *
 * Nothing relay-side recovers the order — a stored event is exactly the seven
 * signed fields, with no ingest sequence, and query order turns out to be
 * id-sorted. So the ordering information has to be in the event or it does not
 * exist.
 *
 * `ts` is epoch **milliseconds**. `fold.ts` accepts it only when it agrees with
 * `created_at` to the second, which is what keeps it from being a new thing to
 * trust: the relay already bounds `created_at` to ±15 minutes of its own clock
 * (FRICTION.md A1), and a `ts` pinned to that second can only refine ordering
 * *within* an already-validated second, never move an event outside it.
 */
export function buildChange(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** Address of the object being changed, `<kind>:<pubkey>:<d>`. */
    target: string
    field: string
    value: string
    folder: string
    /** Optional human note — this is what makes the activity feed readable. */
    note?: string
  },
): UnsignedEvent {
  assertFolderId(args.folder)
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.CHANGE,
    tags: [
      ['a', args.target],
      ['field', args.field],
      ['value', args.value],
      ['h', args.folder],
      // Appended last so the four tags the spec fixes keep their documented
      // order. An app that does not know `ts` ignores it and still folds — just
      // at one-second resolution.
      ['ts', String(Math.floor(createdAtMs))],
    ],
    content: args.note ?? '',
  }
}

/**
 * kind:9 conversation message — the same kind Peek writes for a topic message.
 *
 * This is the whole of "better commenting", and it needed no new protocol. A
 * project *is* a Folder, and a Peek topic *is* that Folder, so a conversation
 * on the project and a conversation in the topic are one event read twice
 * rather than two records to reconcile. Peek's sync already imports a foreign
 * pubkey's `kind:9` as a message, and one carrying an `e` tag as a reply into
 * the right thread — so writing this shape makes Ship's conversations
 * appear in Peek with no change on Peek's side at all.
 *
 * Threading is Buzz's own: no `e` tag is a root message and starts a
 * conversation; `['e', root, '', 'reply']` is a direct reply; a root/reply pair
 * is a reply to a reply. `threadTags` is the byte-verified builder.
 *
 * `about` names the object the conversation concerns, and is what puts a thread
 * under an issue rather than only on the project. Two ways in, because two apps
 * write these:
 *
 *  - an `a` tag, which Ship and Peek's widget set explicitly;
 *  - a `nostr:naddr…` in the body, which is what a person typing in Peek does.
 *
 * The naddr is appended to the body when Ship starts a conversation
 * about an issue, so Peek renders the issue widget above the message instead of
 * showing a bare comment with no indication of what it refers to.
 */
export function buildConversationMessage(
  pubkey: string,
  createdAtMs: number,
  args: {
    folder: string
    body: string
    /** Omit to start a conversation; pass to reply into an existing one. */
    replyTo?: ThreadRef
    /** Address of the Issue or Project this conversation is about. */
    about?: string
  },
): UnsignedEvent {
  assertFolderId(args.folder)
  const event = buildMessage(pubkey, createdAtMs, {
    channelUuid: args.folder,
    content: args.body,
  })
  const tags: NostrTag[] = [...event.tags]
  if (args.replyTo) tags.push(...threadTags(args.replyTo))
  if (args.about) tags.push(['a', args.about])
  // Same `ts` as a change event, for the same reason and found the same way:
  // `created_at` is seconds, two messages posted in one second sorted by event
  // id, and the thread read back in the wrong order. A conversation is the one
  // place where wrong order is not a subtle bug — it is an unreadable exchange
  // (FRICTION.md A6). An app that does not know `ts` ignores it and still
  // threads, just at one-second resolution.
  tags.push(['ts', String(Math.floor(createdAtMs))])
  return { ...event, tags }
}

/**
 * kind:5 NIP-09 deletion request.
 *
 * A *request*, not a delete. Nothing on Nostr can unpublish an event: this asks
 * the relays that hold it to drop it, and they may decline. Measured against
 * Buzz it is accepted and honoured — the addressable event stops coming back —
 * but a copy on another relay, or in another app's cache, is untouched.
 *
 * NIP-09 is **author-scoped**: a relay honours a deletion only from the pubkey
 * that signed the original. That is the same constraint `kind:1851` exists to
 * work around, and here it cannot be worked around, which is why archiving is
 * the operation offered to everyone and this one is offered only to the author.
 *
 * `a` names the addressable event; `k` its kind, which NIP-09 requires so a
 * relay can act without fetching the target first. `h` because the relay
 * channel-scopes ingest and would otherwise reject this outright.
 */
export function buildDeletion(
  pubkey: string,
  createdAtMs: number,
  args: { target: string; folder: string; reason?: string },
): UnsignedEvent {
  assertFolderId(args.folder)
  const [targetKind] = args.target.split(':')
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.DELETION,
    tags: [
      ['a', args.target],
      ['k', targetKind],
      ['h', args.folder],
    ],
    content: args.reason ?? '',
  }
}

/**
 * A shareable Folder link: `folder:<uuid>`.
 *
 * Deliberately not a URL. A Folder is not owned by any one app, so a link
 * pointing at `localhost:5190` would be a Ship link to a shared
 * container — exactly the framing the projection principle rejects. This says
 * "the Folder with this id" and nothing about who renders it.
 *
 * Accepts a bare UUID too, because that is what someone who dug the id out of a
 * database will paste, and refusing it would be pedantry.
 */
export const FOLDER_LINK_PREFIX = 'folder:'

export function folderLink(folder: string): string {
  assertFolderId(folder)
  return `${FOLDER_LINK_PREFIX}${folder}`
}

/** Pull a Folder id out of a pasted link, bare UUID, or URL containing one. */
export function parseFolderLink(input: string): string | null {
  const match = input
    .trim()
    .toLowerCase()
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/)
  return match ? match[0] : null
}

/** Address of a Project: `30850:<pubkey>:<d>`. */
export function projectAddr(pubkey: string, projectId: string): string {
  return addr(KIND.PROJECT, pubkey, projectId)
}

/** Address of an Issue: `30851:<pubkey>:<d>`. */
export function issueAddr(pubkey: string, issueId: string): string {
  return addr(KIND.ISSUE, pubkey, issueId)
}
