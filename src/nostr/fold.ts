/**
 * The fold: root event + change events → current state.
 *
 * A shared record here is not a mutable row. It is an immutable root plus an
 * append-only stream of `kind:1851` changes, replayed at read time
 * (RFC_UPDATES.md §1.1). Two things fall out of that and both are load-bearing:
 *
 *  - **Nobody rewrites anyone else's event.** NIP-33 addresses are
 *    `(pubkey, kind, d)`, so an edit is only available to an object's author.
 *    A change is authored by whoever acts, so a second person can act at all.
 *  - **The activity feed is free.** It is not reconstructed from the state; it
 *    *is* the stream the state was folded from.
 *
 * Pure functions over already-fetched events — no relay, no clock. Everything
 * here is deterministic, which is what makes "two apps agree on the state"
 * checkable rather than hopeful.
 */
import { blockAnchorOf, contentFormatOf, quoteOf, type ContentFormat, type Quote, type SignedEvent } from '@estiva-app/protocol'
import { DELETED_FIELD, fieldsSetBy, stageTagOf, type ForeignObject, type Stage } from '@estiva-app/interop'
import { foldThreads, isAbout } from '@estiva-app/conversation'
import { readFiles } from './files'
import { KIND } from './kinds'

/** First value of a tag, or undefined. Tags are `[name, value, …]`. */
function tag(event: SignedEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1]
}

/** Every value of a repeated tag. */
function tags(event: SignedEvent, name: string): string[] {
  return event.tags.filter((t) => t[0] === name).map((t) => t[1])
}

/**
 * Effective ordering time, in milliseconds.
 *
 * `created_at` is seconds, which is too coarse: measured against the live relay,
 * five sequential changes from one client shared a single `created_at`. So a
 * change may carry a `ts` tag in epoch milliseconds (see `events.ts`).
 *
 * `ts` is accepted **only when it agrees with `created_at` to the second**, and
 * that condition is the whole trust argument. The relay validates `created_at`
 * against its own clock (±15 min, FRICTION.md A1); a `ts` pinned inside that
 * second inherits the validation and can only order events *within* it. A `ts`
 * of `Number.MAX_SAFE_INTEGER`, from a buggy app or a client trying to make its
 * write always win, fails the check and is ignored rather than believed —
 * which matters because under the honour-system model nothing else is
 * validating these writes (RFC_UPDATES.md §3).
 *
 * **Exactly that second** — SPEC §6.2, clarified 2026-09-29 (CON-5), and
 * `@estiva-app/conversation`'s `orderingMs`, which every other fold uses. This
 * allowed ±1 s until PER-21, which let a `ts` claim the neighbouring second —
 * the one thing the rule exists to prevent. Every writer floors, so the strict
 * reading changes no fold on production. Kept local only because the fold
 * orders parsed changes rather than events.
 */
function orderingMs(event: { createdAt: number; ts?: number }): number {
  if (event.ts !== undefined && Math.floor(event.ts / 1000) === event.createdAt) {
    return event.ts
  }
  return event.createdAt * 1000
}

/** An event's position in the total order the fold replays. */
interface Ordered {
  createdAt: number
  ts?: number
  id: string
}

/**
 * Oldest first by SPEC §6.3: effective time, then the lower id, so the last of
 * two changes in one millisecond is the higher id, as the shared read folds.
 */
function byOrder(a: Ordered, b: Ordered): number {
  const at = orderingMs(a)
  const bt = orderingMs(b)
  if (at !== bt) return at - bt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** One field assignment, parsed out of a kind:1851. */
export interface Change {
  id: string
  /** Whoever acted. Frequently not the object's author — that is the point. */
  author: string
  createdAt: number
  /**
   * Epoch ms. Parsed from a kind:1851 (`parseChange`): the `ts` tag's number as
   * written, trusted or not; only `orderingMs` decides whether it orders the
   * change. On a change the shared read counted (a file's `activity`), always
   * set: its ordering time, the `ts` where a reader trusts it, else `created_at`
   * in ms. Read it through `orderingMs`, never on its own.
   */
  ts?: number
  /** Address of the object changed, `<kind>:<pubkey>:<d>`. */
  target: string
  field: string
  value: string
  /**
   * Which content model `value` is written in — SPEC §13.4.
   *
   * It travels with the change rather than with the object, because the tag is
   * on the event the value came from: a description created as marker text and
   * later edited into blocks is an untagged root plus a tagged change, and the
   * fold takes the change's value. Reading the root's tag would report the
   * format of a value that is no longer displayed.
   */
  format: ContentFormat
  /**
   * What the value means, when the change says (SPEC §6.2's `["stage", field, …]`),
   * read by interop's `stageTagOf`. It travels with the change, like `format`:
   * a later change with none leaves none (EAC-3).
   */
  stage?: Stage
  /** Optional human note from `.content`. */
  note: string
  /**
   * The Folder the change was signed in: its first `h` with a value, the one
   * the relay checks the signer's membership against. A `buzz-channel` on a
   * change proves nothing, so it is not read (SPEC §6.2).
   */
  folder?: string
  /** The file the change says it is about, by its id: its `O` (SPEC §6.2). */
  about?: string
}

/** Fields on a Project or Issue that changes are allowed to set. */
/** Each field's winning change; `id` is that change's, the field's next `prev` (SPEC §6.2). */
export type FoldedFields = Record<string, { value: string; by: string; at: number; format: ContentFormat; id: string; stage?: Stage }>

export interface Project {
  addr: string
  id: string
  author: string
  createdAt: number
  title: string
  description: string
  /**
   * Which content model `description` is in — SPEC §13.4, resolved.
   *
   * From the winning change when one set the description, otherwise from the
   * root's own tag. Absent means marker text, permanently: 731 published
   * bodies carry no tag and none of them can be given one.
   */
  descriptionFormat: ContentFormat
  /** The one-line summary beside the title, as `fileSummary` reads it; absent when it has none. */
  summary?: string
  /**
   * The Folder the project record names: `buzz-channel` on a global record,
   * `h` on a channel-scoped one — the same answer interop's `folderOf` gives.
   *
   * Where a `kind:1851` about the project is addressed, since changes stay
   * channel-scoped whatever the record does, and where new issues and
   * comments go (`workFolder` in `api/writes.ts`), never the Folder that
   * lists the project. Nothing overrides this one: the
   * `folder` field that used to re-point a project is no longer read (MAN-5),
   * and a move changes only the Folder listings (FOL-7). Older issues and
   * threads may sit in other Folders; they are found by their parent and
   * anchor, not by this.
   */
  contentFolder: string
  lead?: string
  /** The project's own key, when it has one on the wire — `projectKeys` gives every project's. */
  key?: string
  status: string
  /** What the status means, as every app counts it (`projectStage`); absent for a word nothing reads. */
  stage?: Stage
  /**
   * Hidden from the lists, reversibly.
   *
   * A folded field rather than a deletion, so anyone in the Folder can do it,
   * it can be undone, and the activity feed records who did it. Deleting is a
   * separate and much narrower operation — see `buildDeletion`.
   */
  archived: boolean
  /**
   * Deleted by a `deleted` change (SPEC §6.13): who and when. Left out of every
   * list and search; its link shows who deleted it, with Restore. An old kind-5
   * delete never reaches the fold: the relay drops the record.
   * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/every-file-is-an-artifact-the-relay-keeps-in-order.md
   */
  deleted?: { by: string; at: number }
  /** The record's event id: the `prev` of a field's first change (SPEC §6.2). */
  rootId?: string
  /** Provenance for every field a change touched. Drives "changed by" in the UI. */
  fields: FoldedFields
}

export interface Issue {
  addr: string
  id: string
  author: string
  createdAt: number
  title: string
  description: string
  /**
   * Which content model `description` is in — SPEC §13.4, resolved.
   *
   * From the winning change when one set the description, otherwise from the
   * root's own tag. Absent means marker text, permanently: 731 published
   * bodies carry no tag and none of them can be given one.
   */
  descriptionFormat: ContentFormat
  /** The one-line summary beside the title, as `fileSummary` reads it; absent when it has none. */
  summary?: string
  folder: string
  /** Parent project address, when the issue has one. */
  projectAddr?: string
  /** Display-only key such as `LL-12`. */
  ref?: string
  status: string
  /** What the status means, as every app counts it (`issueStage`); absent for a word nothing reads. */
  stage?: Stage
  assignee?: string
  /**
   * Deleted by a `deleted` change (SPEC §6.5), as a project is: who and when.
   * It keeps its ref, so a restore brings back the same name and a new issue
   * never takes it (§6.1). An old kind-5 delete never reaches the fold.
   * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
   */
  deleted?: { by: string; at: number }
  /** The record's event id: the `prev` of a field's first change (SPEC §6.2). */
  rootId?: string
  fields: FoldedFields
}

/** Parse a kind:1851 into a Change, or null if it is not a well-formed one. */
export function parseChange(event: SignedEvent): Change | null {
  if (event.kind !== KIND.CHANGE) return null
  // One walk of the tags for everything a change says: each is the first tag
  // of its name, and the team the first `h` with a value.
  let target: string | undefined
  let field: string | undefined
  let value: string | undefined
  let ts: string | undefined
  let folder: string | undefined
  let about: string | undefined
  let seen = 0
  let formatted = false
  let staged = false
  for (const t of event.tags) {
    switch (t[0]) {
      case 'a':
        if (!(seen & 1)) target = t[1]
        seen |= 1
        break
      case 'field':
        if (!(seen & 2)) field = t[1]
        seen |= 2
        break
      case 'value':
        if (!(seen & 4)) value = t[1]
        seen |= 4
        break
      case 'ts':
        if (!(seen & 8)) ts = t[1]
        seen |= 8
        break
      case 'O':
        if (!(seen & 16)) about = t[1]
        seen |= 16
        break
      case 'h':
        if (folder === undefined && t[1]) folder = t[1]
        break
      case 'content-format':
        formatted = true
        break
      case 'stage':
        staged = true
        break
    }
  }
  // A change that names no object, or no field, sets nothing. Drop it rather
  // than fold a partial: another app wrote this, and the honour system means
  // malformed events do reach us (RFC_UPDATES.md §3).
  if (!target || !field || value === undefined) return null
  const rawTs = Number.parseInt(ts ?? '', 10)
  const change: Change = {
    id: event.id,
    author: event.pubkey,
    createdAt: event.created_at,
    ts: Number.isFinite(rawTs) ? rawTs : undefined,
    target,
    field,
    value,
    // Marker text unless it says otherwise; what it says is `contentFormatOf`'s to name.
    format: formatted ? contentFormatOf(event) : 'marker',
    note: event.content,
    folder,
  }
  const stage = staged ? stageOn(event, field, value).stage : undefined
  if (stage) change.stage = stage
  if (about !== undefined) change.about = about
  return change
}

/** The stage a change gives the field it sets, as interop reads it; none on a cleared value. */
function stageOn(event: SignedEvent, field: string, value: string): { stage?: Stage } {
  const stage = value === '' ? undefined : stageTagOf(event, field)
  return stage ? { stage } : {}
}

/**
 * Every field one kind:1851 sets: `parseChange`'s one, or one per `set` tag of
 * a change setting several fields (SPEC §6.2), each as its own Change with the
 * event's id, which is each field's next `prev`. Read by interop's
 * `fieldsSetBy`, as every manifest reader reads it.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/one-change-may-set-several-fields-taken-whole-or-refused-whole.md
 */
export function parseChanges(event: SignedEvent): Change[] {
  // A signed event never changes, and the workspace is folded again on every
  // live update from the same events: each is parsed once, and its answer goes
  // when the event does.
  let held = parsed.get(event)
  if (!held) parsed.set(event, (held = parseEvent(event)))
  return held
}
const parsed = new WeakMap<SignedEvent, Change[]>()

function parseEvent(event: SignedEvent): Change[] {
  const one = parseChange(event)
  if (one) return [one]
  if (event.kind !== KIND.CHANGE || !event.tags.some((t) => t[0] === 'set')) return []
  // Read as a one-field change for its `a`, `ts` and `h`; the fields come from the `set` tags.
  const head = parseChange({ ...event, tags: [...event.tags, ['field', 'set'], ['value', '']] })
  if (!head) return []
  // `head` carries no stage (its value is ''), so each field's is its own.
  // The format is `head`'s, the event's `content-format` as `contentFormatOf` names it. `fieldsSetBy`
  // gives the tag's own word (`estiva-blocks-1`), which no page here takes for `blocks` (MOV-1).
  return fieldsSetBy(event).map(({ field, value }) => ({ ...head, field, value, ...stageOn(event, field, value) }))
}

/**
 * The changes the shared read counted toward one file, as Ship's pages hold a
 * change. Which ones count is the shared read's answer (signed in the file's
 * team, about this file, setting a field): nothing here decides it again.
 * A file the shared read hands back unchanged gives the same list back.
 */
function changesOf(file: ForeignObject): Change[] {
  let held = listed.get(file)
  if (held) return held
  held = []
  const lines = file.changes ?? []
  const target = file.address!
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const event = line.event
    const change: Change = {
      id: event.id,
      author: event.pubkey,
      createdAt: event.created_at,
      // The time the shared read orders it by: its `ts` where a reader trusts it (SPEC §6.2), which is all a `ts` is read for.
      ts: line.ms,
      target,
      field: line.field,
      value: line.value,
      format: line.format,
      note: event.content,
      folder: line.folder,
    }
    if (line.stage) change.stage = line.stage
    if (line.about !== undefined) change.about = line.about
    held.push(change)
  }
  listed.set(file, held)
  return held
}
const listed = new WeakMap<ForeignObject, Change[]>()

/** The one-line summary beside a file's title (SPEC §6.12). */
const SUMMARY_FIELD = 'summary'

/**
 * The one value that archives or deletes a file (SPEC §6.5; the manifest's
 * `hiddenWhen` and vocabularies say the same). Any other value, `false`
 * included, reads as live, as every manifest reader reads it: Ship took any
 * non-empty value, so a file another app restored with `false` stayed
 * archived or deleted in Ship alone (TES-2).
 */
export const ARCHIVED_OR_DELETED = 'true'

/** One message: either a conversation root, or a reply inside one. */
export interface Message {
  id: string
  author: string
  createdAt: number
  /** Epoch ms from the `ts` tag, when present and consistent with `created_at`. */
  ts?: number
  body: string
  /** The Folder it was posted in — needed to reply into the same container. */
  folder: string
  /** Thread root event id. Undefined on a root message. */
  rootId?: string
  /** Direct parent event id. Equals `rootId` for a direct reply. */
  parentId?: string
  /** Object addresses this message is about — `a` tags plus naddrs in the body. */
  about: string[]
  /**
   * A NIP-22 comment's `A`: the object its thread is about. Undefined on a
   * `kind:9`. A reply to the comment copies it (`buildNip22Reply`, SHI-28).
   */
  anchor?: string
  /**
   * The block this comment is anchored to — SPEC §13.6.
   *
   * The address in `about` says *which object*; this says *which part of it*.
   * Undefined is a comment about the whole object, and that is a different
   * thing from an anchor that no longer resolves — `resolveBlockAnchor` is what
   * tells those apart, and §13.6 forbids collapsing them.
   */
  blockId?: string
  /**
   * The words a comment quotes, when it was written on a selection (Leaf,
   * LEAF-7): its `quote` tag, read by the protocol's rule. Undefined on a
   * comment on whole blocks or the whole file, and on a `kind:9`.
   * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-comment-points-at-blocks-and-the-words-quoted.md
   */
  quote?: Quote
}

/*
  The event each message was read from, beside the fold's output rather than in
  it: the page reads it again through the shared fold with its reactions and
  resolutions (ONE-9), and the recorded state the conformance fixture holds, which
  estiva-agent folds too, stays what it was.
*/
const eventOfMessage = new WeakMap<Message, SignedEvent>()

/** The event `message` was read from, when the fold read it (not for a message built by hand). */
export function eventOf(message: Message): SignedEvent | undefined {
  return eventOfMessage.get(message)
}

/** `to`, a copy of `from`, read from the same event. */
function sameEvent<T extends Message>(from: Message, to: T): T {
  const event = eventOfMessage.get(from)
  if (event) eventOfMessage.set(to, event)
  return to
}

function withEvent(message: Message, event: SignedEvent): Message {
  eventOfMessage.set(message, event)
  return message
}

/**
 * A conversation: a root message and its replies, oldest first.
 *
 * The same shape Peek shows in a topic, because it is the same events. Peek
 * calls the root a "message" and the rest "replies"; the wire format is
 * identical and so is this.
 */
export interface Conversation {
  /** Event id of the root message, which is what replies point at. */
  id: string
  root: Message
  /** Replies, oldest first. */
  replies: Message[]
  /**
   * Every object anyone in the thread referenced.
   *
   * Thread-wide on purpose: a discussion that mentions an issue halfway through
   * is, from then on, about that issue, and the earlier messages are the
   * context somebody needs. Attaching only the message that carried the
   * reference would show the answer without the question.
   */
  about: string[]
  createdAt: number
  /** Newest message in the thread — what a list should sort on. */
  lastAt: number
  /**
   * The message the thread hangs from is not in the read (SPEC §6.5): deleted,
   * or outside what this reader can read. `root` is then the earliest reply,
   * standing in for it; which of the two it is, the page learns with its
   * reactions (its author's `kind:5`, `useReactions`), and the one conversation
   * draws "This comment was deleted." or "This comment can't be shown." in its
   * place, with every message under it and no new reply (ONE-9).
   */
  rootMissing?: true
}

/**
 * Parse a kind:9 into a Message.
 *
 * Thread tags are Buzz's own: no `e` is a root; `['e', id, '', 'reply']` alone
 * is a direct reply; a `root`/`reply` pair is a reply to a reply. Markers are
 * honoured when present and positions used when they are not, because a message
 * written by a client that omits markers still has to thread.
 */
export function parseMessage(event: SignedEvent, resolveRefs: (body: string) => string[]): Message | null {
  if (event.kind === KIND.COMMENT) return parseNip22Comment(event, resolveRefs)
  if (event.kind !== KIND.MESSAGE) return null
  const es = event.tags.filter((t) => t[0] === 'e')
  const marked = (name: string) => es.find((t) => t[3] === name)?.[1]
  const rootId = marked('root') ?? (es.length > 1 ? es[0]?.[1] : undefined) ?? marked('reply') ?? es[0]?.[1]
  const parentId = marked('reply') ?? es[es.length - 1]?.[1] ?? rootId

  const rawTs = Number.parseInt(tag(event, 'ts') ?? '', 10)
  return withEvent({
    id: event.id,
    author: event.pubkey,
    createdAt: event.created_at,
    ts: Number.isFinite(rawTs) ? rawTs : undefined,
    body: event.content,
    folder: tag(event, 'h') ?? '',
    rootId,
    parentId,
    // Both routes to "what is this about": an explicit `a` tag, and a
    // `nostr:naddr…` typed into the body by a person in Peek.
    about: [...new Set([...tags(event, 'a'), ...resolveRefs(event.content)])],
    ...(blockAnchorOf(event) ? { blockId: blockAnchorOf(event) } : {}),
  }, event)
}

/**
 * A NIP-22 `kind:1111` comment, read into the same `Message` shape as a `kind:9`.
 *
 * REW-10 moves Ship's comments to `1111`, and this is the reader half — landed
 * before anything writes one, for the reason REW-11 established: the two shapes
 * coexist permanently. A `kind:9` comment is **not replaceable at all**, so
 * unlike a project record it cannot be rewritten even by its own author. Every
 * comment written to date stays `kind:9` forever, and a reader that only learns
 * `1111` loses the entire existing conversation history.
 *
 * ## Case matters, and it is the whole of NIP-22
 *
 * Uppercase `A`/`E`/`K`/`P` name the **thread root** — the object being
 * discussed. Lowercase name the **immediate parent** — the comment being
 * replied to. For a top-level comment the two are the same, which is why the
 * spec has both: without the uppercase pair, a reply three deep would have
 * nothing left saying what the thread is about.
 *
 * Mapped onto Ship's model:
 *
 * - **`about`** takes the uppercase `A` (and any lowercase `a`, which for a
 *   top-level comment repeats it). That is what puts the comment under its
 *   issue in `conversationsAbout`, and it is the same field a `kind:9` fills
 *   from its own `a` tag — so both shapes land in the same thread.
 * - **`rootId`** is the uppercase `E` when the thread roots at an *event*. When
 *   it roots at an *address* — which is Ship's case, since an issue is
 *   addressable — there is no root event id, so a top-level comment becomes its
 *   own conversation root exactly as a `kind:9` with no `e` tag does.
 * - **`parentId`** is the lowercase `e`: the comment being replied to.
 *
 * `h` is read the same way and matters as much: `1111` is channel-scoped when
 * it carries one and **global when it does not**, so a comment published
 * without an `h` is world-readable regardless of how private its issue is.
 * Nothing here can fix that — it has to be got right at write time.
 */
function parseNip22Comment(
  event: SignedEvent,
  resolveRefs: (body: string) => string[],
): Message | null {
  const rootEvent = tag(event, 'E')
  const parentEvent = tag(event, 'e')
  const rawTs = Number.parseInt(tag(event, 'ts') ?? '', 10)
  return withEvent({
    id: event.id,
    author: event.pubkey,
    createdAt: event.created_at,
    ts: Number.isFinite(rawTs) ? rawTs : undefined,
    body: event.content,
    folder: tag(event, 'h') ?? '',
    rootId: rootEvent ?? parentEvent,
    parentId: parentEvent ?? rootEvent,
    about: [
      ...new Set([
        ...tags(event, 'A'),
        ...tags(event, 'a'),
        ...resolveRefs(event.content),
      ]),
    ],
    ...(tag(event, 'A') ? { anchor: tag(event, 'A') } : {}),
    ...(blockAnchorOf(event) ? { blockId: blockAnchorOf(event) } : {}),
    ...(quoteOf(event) ? { quote: quoteOf(event) } : {}),
  }, event)
}

/**
 * Group messages into conversations, by the one shared fold (`foldThreads`,
 * SPEC §6.3–§6.5), as Peek and Leaf group them: a reply to a reply is filed
 * under its thread's comment (§6.4), and a thread whose comment the read did
 * not return keeps its replies. Newest activity first.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-conversation-is-one-shared-thing-and-only-its-colours-are-the-apps.md
 */
function conversationsOf(messages: Message[]): Conversation[] {
  const byId = new Map(messages.map((message) => [message.id.toLowerCase(), message]))
  const conversations: Conversation[] = []
  for (const thread of foldThreads(messages.flatMap((message) => eventOf(message) ?? []))) {
    const found = thread.root ? byId.get(thread.root.id) : undefined
    // A reply's thread is the fold's, however deep it answers: a reply to a reply names only its parent (NIP-22 `e`).
    const answers = thread.replies.flatMap((reply) => {
      const message = byId.get(reply.id)
      return message ? [sameEvent(message, { ...message, rootId: thread.id })] : []
    })
    // A thread whose comment is not here — deleted, or outside the read — is
    // still worth showing: its earliest reply stands in for it, and keeps the
    // thread's place (the cards then say "deleted" or "can't be shown" in its place).
    const root = found ?? answers[0]
    if (!root) continue
    // A reply copies its comment's `block` (SPEC §13.6): the thread's place,
    // which the root already shows, so a reply draws none of its own. A reply
    // standing in for a gone comment keeps it, and with it the thread's place.
    // why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-reply-on-a-page-keeps-its-threads-place.md
    const replies = answers.filter((message) => message !== root).map((message) => {
      const { blockId: _, ...reply } = message
      return sameEvent(message, reply)
    })
    const group = [root, ...replies]
    conversations.push({
      id: thread.id,
      root,
      replies,
      about: [...new Set(group.flatMap((message) => message.about))],
      createdAt: root.createdAt,
      lastAt: Math.max(...group.map((message) => message.createdAt)),
      ...(found ? {} : { rootMissing: true as const }),
    })
  }
  conversations.sort((a, b) => b.lastAt - a.lastAt)
  return conversations
}

/**
 * A thread as the page at `address` takes it. A thread whose comment is gone
 * keeps only the messages that are themselves about the page (`isAbout`, §6.4),
 * as a comment must be: the workspace read files any reply naming the gone id
 * under it, and one about another page must not speak for this page's thread —
 * its team (§6.5), and with it which resolve counts. `null` when none is. A
 * thread whose comment is here is the comment's, and is returned as it is.
 * Leaf keeps the same (leaf#110).
 */
export function threadOnPage(conversation: Conversation, address: string): Conversation | null {
  if (!conversation.rootMissing) return conversation
  const kept = [conversation.root, ...conversation.replies].filter((message) => {
    const event = eventOf(message)
    return event !== undefined && isAbout(event, address)
  })
  const [first, ...rest] = kept
  if (!first) return null
  if (first === conversation.root) {
    if (rest.length === conversation.replies.length) return conversation
  }
  // A reply that now stands in for the comment takes back the thread's place, which `conversationsOf` took off it.
  const block = first === conversation.root ? first.blockId : blockAnchorOf(eventOf(first)!)
  const root = first === conversation.root ? first : sameEvent(first, { ...first, ...(block ? { blockId: block } : {}) })
  const group = [root, ...rest]
  return {
    ...conversation,
    root,
    replies: rest,
    about: [...new Set(group.flatMap((message) => message.about))],
    createdAt: root.createdAt,
    lastAt: Math.max(...group.map((message) => message.createdAt)),
  }
}

/** Conversations that concern a particular object. */
export function conversationsAbout(
  conversations: Conversation[],
  address: string,
): Conversation[] {
  return conversations.filter((conversation) => conversation.about.includes(address))
}

/** The whole readable state of one Folder. */
export interface FolderState {
  projects: Project[]
  issues: Issue[]
  /** Every change, oldest first. This is the activity feed. */
  activity: Change[]
  /** Conversations in these Folders, most recently active first. */
  conversations: Conversation[]
}

/**
 * Fold a Folder's raw events into current state.
 *
 * Takes everything the relay returned for one `h` and sorts it out here rather
 * than issuing a query per object — one round trip, and the change stream has
 * to be read in full anyway to fold it.
 */
export function foldFolder(
  events: SignedEvent[],
  /**
   * How to turn `nostr:naddr…` in a message body into addresses.
   *
   * Injected rather than imported so this module stays free of bech32 and
   * remains a pure fold over already-fetched events. `store.ts` supplies the
   * real decoder; a caller that does not care can omit it.
   */
  resolveRefs: (body: string) => string[] = () => [],
): FolderState {
  // What each project and issue is now comes from the shared read (MOV-3), and
  // so does which changes counted toward it: the read has walked every change
  // once already, and the activity feed is those same changes, so it can never
  // disagree with the state they produced.
  const { projects, issues, files } = readFiles(events)
  const held = new Set<string>()
  // What each change event set, by the event: the feed is listed in the order
  // the events came, which is already close to §6.3's and makes the sort below
  // short work. Listed file by file, it took as long to sort as to read.
  const counted = new Map<SignedEvent, Change | Change[]>()
  for (const file of files) {
    held.add(file.address!)
    const lines = file.changes ?? []
    const own = changesOf(file)
    for (let i = 0; i < own.length; i++) {
      const event = lines[i].event
      const before = counted.get(event)
      if (before === undefined) counted.set(event, own[i])
      else if (Array.isArray(before)) before.push(own[i])
      else counted.set(event, [before, own[i]])
    }
  }
  const changes: Change[] = []
  for (const event of events) {
    if (event.kind !== KIND.CHANGE) continue
    const own = counted.get(event)
    if (own !== undefined) {
      if (Array.isArray(own)) for (const change of own) changes.push(change)
      else changes.push(own)
      // The same event object handed in twice was counted twice above, and is listed here once.
      counted.delete(event)
      continue
    }
    // A change to a file whose record is not in the read (only its address is
    // held) cannot be checked against its team and counts as before; a summary
    // and a delete take no such exception (SPEC §6.12, §6.5). One the shared
    // read left out of a file it did read stays out.
    const target = tag(event, 'a')
    if (target === undefined || held.has(target)) continue
    for (const change of parseChanges(event)) {
      if (change.field !== SUMMARY_FIELD && change.field !== DELETED_FIELD) changes.push(change)
    }
  }
  // Oldest first, in exactly the total order the fold replays.
  changes.sort(byOrder)

  const messages: Message[] = []
  for (const event of events) {
    const message = parseMessage(event, resolveRefs)
    if (message) messages.push(message)
  }
  const conversations = conversationsOf(messages)

  return { projects, issues, activity: changes, conversations }
}
