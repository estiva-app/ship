/**
 * Event builders for Linear-lite's three kinds.
 *
 * Same discipline as `lib/nostr/events.ts`: pure functions, no I/O, no
 * randomness, so the shapes are unit-testable and the caller owns identity and
 * timing.
 *
 * Tag order is fixed per builder and matches LINEAR_LITE_SPEC.md §1. It is part
 * of the NIP-01 id preimage, so reordering a tag changes the event id.
 */
import { addr, toNostrSeconds, type NostrTag, type UnsignedEvent } from '../lib/nostr/events'
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

/** kind:30850 Project. Tag order: d, title, h, [lead]. */
export function buildProject(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** Stable project id — the `d` tag. */
    projectId: string
    title: string
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

/** Address of a Project: `30850:<pubkey>:<d>`. */
export function projectAddr(pubkey: string, projectId: string): string {
  return addr(KIND.PROJECT, pubkey, projectId)
}

/** Address of an Issue: `30851:<pubkey>:<d>`. */
export function issueAddr(pubkey: string, issueId: string): string {
  return addr(KIND.ISSUE, pubkey, issueId)
}
