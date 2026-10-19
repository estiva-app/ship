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
import { blockAnchorOf, contentFormatOf, type ContentFormat, type SignedEvent } from '@estiva-app/protocol'
import { DEFAULT_ISSUE_STATUS, DEFAULT_PROJECT_STATUS, KIND } from './kinds'
import { summaryText } from './summary'

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
 * Does `a` win over `b`?
 *
 * Later effective time wins. On a tie the **higher** event id wins: SPEC §6.3
 * replays oldest-first by id and the last write wins, which is what
 * `@estiva-app/interop`'s change fold and conversation's edit fold do (Miky,
 * 2026-10-02, PER-21). This picked the lower id — NIP-01's rule for replaceable
 * events — until then, so a Ship reader and a manifest reader could fold one
 * object two ways. With millisecond resolution a genuine tie means two people
 * acting in the same millisecond; production has none.
 *
 * The property that matters: this is a total order over events, so every client
 * folds to the same answer without talking to any other client.
 */
function wins(a: Ordered, b: Ordered): boolean {
  const [at, bt] = [orderingMs(a), orderingMs(b)]
  if (at !== bt) return at > bt
  return a.id > b.id
}

/** Compare in the same total order `wins` defines, oldest first. */
function byOrder(a: Ordered, b: Ordered): number {
  const [at, bt] = [orderingMs(a), orderingMs(b)]
  if (at !== bt) return at - bt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** One field assignment, parsed out of a kind:1851. */
export interface Change {
  id: string
  /** Whoever acted. Frequently not the object's author — that is the point. */
  author: string
  createdAt: number
  /** Epoch ms from the `ts` tag, when present and consistent with `created_at`. */
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
  /** Optional human note from `.content`. */
  note: string
  /**
   * The Folder the change was signed in: its first `h` with a value, the one
   * the relay checks the signer's membership against. A `buzz-channel` on a
   * change proves nothing, so it is not read (SPEC §6.2).
   */
  folder?: string
}

/** Fields on a Project or Issue that changes are allowed to set. */
export type FoldedFields = Record<string, { value: string; by: string; at: number; format: ContentFormat }>

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
   * channel-scoped whatever the record does. New issues and comments go to
   * the Folder that lists the project instead (`workFolder` in
   * `api/writes.ts`). Nothing overrides this one: the
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
  /**
   * Hidden from the lists, reversibly.
   *
   * A folded field rather than a deletion, so anyone in the Folder can do it,
   * it can be undone, and the activity feed records who did it. Deleting is a
   * separate and much narrower operation — see `buildDeletion`.
   */
  archived: boolean
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
  assignee?: string
  fields: FoldedFields
}

/** Parse a kind:1851 into a Change, or null if it is not a well-formed one. */
export function parseChange(event: SignedEvent): Change | null {
  if (event.kind !== KIND.CHANGE) return null
  const target = tag(event, 'a')
  const field = tag(event, 'field')
  const value = tag(event, 'value')
  // A change that names no object, or no field, sets nothing. Drop it rather
  // than fold a partial: another app wrote this, and the honour system means
  // malformed events do reach us (RFC_UPDATES.md §3).
  if (!target || !field || value === undefined) return null
  const rawTs = Number.parseInt(tag(event, 'ts') ?? '', 10)
  return {
    id: event.id,
    author: event.pubkey,
    createdAt: event.created_at,
    ts: Number.isFinite(rawTs) ? rawTs : undefined,
    target,
    field,
    value,
    format: contentFormatOf(event),
    note: event.content,
    folder: event.tags.find((t) => t[0] === 'h' && t[1])?.[1],
  }
}

/** The tags a root names its Folder with: `h`, or Ship's older `buzz-channel` (SPEC §7.3). */
const PLACEMENTS = ['h', 'buzz-channel']

/**
 * Every Folder a root is filed in, or `undefined` when it names none.
 *
 * All of them, both tags, not `projectFolder`'s first: the question here is
 * whether a change's Folder is one the file is in, and a root carrying both
 * tags is in both. Read the same way as interop's `targetFolders`.
 */
function rootFolders(root: SignedEvent): ReadonlySet<string> | undefined {
  const folders = new Set(PLACEMENTS.flatMap((name) => root.tags.filter((t) => t[0] === name && t[1]).map((t) => t[1]!)))
  return folders.size ? folders : undefined
}

/**
 * Drop every change signed in a Folder its target is not in (SPEC §6.2).
 *
 * The relay checks a change only against its own `h`, so a member of any
 * Folder can sign a rename, a status, an archive or a move aimed at an issue
 * in a Folder they cannot read, and Ship pools every Folder it reads into one
 * fold. Without this, anyone in both Folders saw that change applied.
 *
 * Two cases cannot be checked and count as before: a target whose root is not
 * in the read (only its address is held), and a root that names no Folder.
 * Checked against the newest root, as `latestPerAddress` picks it. A dropped
 * change leaves the activity feed too: it set nothing, so a line saying it did
 * would be the feed disagreeing with the state.
 *
 * A `summary` takes neither exception (SPEC §6.12): new, so nothing written
 * before the rule depends on it, it counts only where the check can be made.
 */
function changesInTargetFolder(changes: Change[], roots: Map<string, SignedEvent>): Change[] {
  const folders = new Map<string, ReadonlySet<string> | undefined>()
  for (const [address, root] of roots) folders.set(address, rootFolders(root))
  return changes.filter((change) => {
    const held = folders.get(change.target)
    if (!held) return change.field !== SUMMARY_FIELD
    return change.folder !== undefined && held.has(change.folder)
  })
}

/** The one-line summary beside a file's title (SPEC §6.12). */
const SUMMARY_FIELD = 'summary'

/**
 * Keep one event per address.
 *
 * The relay replaces addressable events on ingest, so in practice this sees one
 * version each. It is here because a *query* can still return two — two relays,
 * a replay, a race — and picking arbitrarily would make the UI flicker between
 * versions on reload.
 */
function latestPerAddress(events: SignedEvent[], kind: number): Map<string, SignedEvent> {
  const byAddr = new Map<string, SignedEvent>()
  for (const event of events) {
    if (event.kind !== kind) continue
    const d = tag(event, 'd')
    if (d === undefined) continue // addressable events without `d` are not addressable
    const address = `${kind}:${event.pubkey}:${d}`
    const held = byAddr.get(address)
    // NIP-01's replaceable-event rule, which the relay applies on ingest: later
    // `created_at`, and on a tie the *lower* id. Not `wins` — that is §6.3's
    // change order, which breaks a tie the other way (PER-21).
    if (!held || event.created_at > held.created_at || (event.created_at === held.created_at && event.id < held.id)) {
      byAddr.set(address, event)
    }
  }
  return byAddr
}

/**
 * Collapse a change stream to the winning assignment per field, per object.
 *
 * Last write wins *per field*, not per object — two people editing different
 * fields of the same issue never conflict, which is the common case.
 */
function foldChanges(changes: Change[]): Map<string, FoldedFields> {
  const byTarget = new Map<string, FoldedFields>()
  const winners = new Map<string, Change>()
  for (const change of changes) {
    // `\0` as the escape, not the byte. The separator has to be something
    // neither an address nor a field name can contain, and NUL is the right
    // choice — but writing it literally made this file binary to the tools that
    // read source: `grep` skipped it and said nothing, and it sat 25 bytes from
    // the 8000-byte window git scans for NUL, so one deletion above here would
    // have turned every diff of this file into "Binary files differ".
    const key = `${change.target}\0${change.field}`
    const held = winners.get(key)
    if (!held || wins(change, held)) winners.set(key, change)
  }
  for (const change of winners.values()) {
    const fields = byTarget.get(change.target) ?? {}
    fields[change.field] = { value: change.value, by: change.author, at: change.createdAt, format: change.format }
    byTarget.set(change.target, fields)
  }
  return byTarget
}

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
  return {
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
  }
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
  return {
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
    // A reply copies its comment's `block` (SPEC §13.6): the thread's place, which its comment already shows, so a reply draws none of its own.
    // why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-reply-on-a-page-keeps-its-threads-place.md
    ...(!parentEvent && blockAnchorOf(event) ? { blockId: blockAnchorOf(event) } : {}),
  }
}

/** Group messages into conversations. */
function foldConversations(messages: Message[]): Conversation[] {
  const threads = new Map<string, Message[]>()
  for (const message of messages) {
    const key = message.rootId ?? message.id
    threads.set(key, [...(threads.get(key) ?? []), message])
  }

  const conversations: Conversation[] = []
  for (const [id, group] of threads) {
    group.sort(byOrder)
    // The root is the message whose id is the thread key. It can be absent —
    // truncated history, or a reply that arrived before its parent — and a
    // thread with no visible root is still worth showing, so the earliest
    // message stands in rather than the whole conversation disappearing.
    const root = group.find((message) => message.id === id) ?? group[0]
    const replies = group.filter((message) => message !== root)
    conversations.push({
      id,
      root,
      replies,
      about: [...new Set(group.flatMap((message) => message.about))],
      createdAt: root.createdAt,
      lastAt: group[group.length - 1].createdAt,
    })
  }
  conversations.sort((a, b) => b.lastAt - a.lastAt)
  return conversations
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
 * The Folder a project record names, under either wire shape.
 *
 * **Both shapes are read, and both stay readable indefinitely.** REW-11 moves
 * the project record off its channel: `["h", uuid]` becomes
 * `["buzz-channel", uuid]`, so the record stops being filed under a Folder and
 * starts merely *pointing* at one. That is upstream's NIP-MP vocabulary, and
 * RFC 0.3 §4.2 argues it is forced — a record filed under a channel cannot be
 * discovered by anyone the channel does not already admit.
 *
 * There is no migration and there will not be one. A replaceable event can only
 * be rewritten by its own author, and rewriting it would stamp a fresh
 * `created_at` over the original — the relay refuses anything more than roughly
 * ±15 minutes from its own clock, so the real date cannot be preserved. Records
 * written before the change keep `h` forever, and a reader that stops
 * understanding `h` loses them.
 *
 * `h` is checked first because every record in existence today has one, and
 * because a record carrying both is transitional rather than global — it is
 * still filed under a channel, whatever else it says.
 */
function projectFolder(event: SignedEvent): string | undefined {
  return tag(event, 'h') ?? tag(event, 'buzz-channel')
}

/**
 * A project's display name: upstream's `name`, or Ship's original `title`.
 *
 * Independent of the `h`/`buzz-channel` swap and read the same way — the
 * vocabulary changed in the same commit, so a record can carry either, and old
 * records carry `title` forever for the same reason they carry `h`.
 */
function projectName(event: SignedEvent): string | undefined {
  return tag(event, 'name') ?? tag(event, 'title')
}

/**
 * A record's description: a `description` tag, or its `.content`.
 *
 * `.content` is the fallback rather than the other way round, so a record that
 * carries the tag is taken at its word even when something also left content
 * behind. An absent tag and an empty one are deliberately different: a record
 * that says its description is empty is not a record that never said.
 *
 * **Read by an issue as well as a project since `add-issue` grew a description
 * field.** It was `projectDescription` and an issue read only `.content`, which
 * was fine while Ship's own composer was the only thing creating one — it puts
 * the body in `content` (`buildIssue`). A foreign consumer cannot: the runtime
 * writes each declared property to a **tag of its own name**, so an issue filed
 * from Peek's launcher carries `["description", …]` and an empty content. An
 * issue reading only content would have rendered every one of those blank while
 * the description sat on the event, published and correct.
 *
 * **This decides the text, never the format.** `descriptionFormat` comes from
 * the event's `content-format` tag (`contentFormatOf`), and §13.4 forbids
 * inferring a format from the body — so moving the text to a tag does not move
 * the format question with it. Do not make this function answer both.
 */
function recordDescription(event: SignedEvent): string {
  return tag(event, 'description') ?? event.content
}

/**
 * A file's summary (SPEC §6.12): the winning change when there is one, else the
 * root's `summary` tag, as plain text on one line.
 *
 * A change wins even when it is blank — that is how a summary is cleared, and
 * the seed must not show through it. Blank after trimming is no summary at all,
 * so the field is left out rather than drawn as an empty line. Line breaks fold
 * to spaces: a summary is one line wherever it is drawn, never markup.
 */
function fileSummary(fields: FoldedFields, event: SignedEvent): string | undefined {
  const raw = fields[SUMMARY_FIELD] ? fields[SUMMARY_FIELD].value : tag(event, 'summary')
  const text = raw === undefined ? undefined : summaryText(raw)
  return text || undefined
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
  const projectRoots = latestPerAddress(events, KIND.PROJECT)
  const issueRoots = latestPerAddress(events, KIND.ISSUE)
  const parsed: Change[] = []
  for (const event of events) {
    const change = parseChange(event)
    if (change) parsed.push(change)
  }
  const changes = changesInTargetFolder(parsed, new Map([...projectRoots, ...issueRoots]))
  // Oldest first, in exactly the total order the fold replays, so the activity
  // feed can never disagree with the state it produced.
  changes.sort(byOrder)

  const folded = foldChanges(changes)

  const projects: Project[] = []
  for (const [address, event] of projectRoots) {
    const fields = folded.get(address) ?? {}
    projects.push({
      addr: address,
      id: tag(event, 'd')!,
      author: event.pubkey,
      createdAt: event.created_at,
      // A change may rename an object. The root still holds the author's title;
      // a change overrides it, because a rename by someone else has nowhere
      // else to live.
      // Two wire shapes, read in one pass, and it stays that way — see
      // `projectFolder` and `projectName` below for why there is no migration.
      title: fields.title?.value ?? projectName(event) ?? '(untitled project)',
      description: fields.description?.value ?? recordDescription(event),
      descriptionFormat: fields.description?.format ?? contentFormatOf(event),
      summary: fileSummary(fields, event),
      // The Folder the record names, and only that. A `folder` change is not
      // read: re-pointing a project is gone (MAN-5).
      contentFolder: projectFolder(event) ?? '',
      lead: fields.lead?.value ?? tag(event, 'lead'),
      // The prefix of its issues' refs (SHI-4, SPEC §6.1): seeded by the root's
      // tag, overridden by a change, as `lead` is. Absent on every project made
      // before keys; `projectKeys` in keys.ts derives one for those.
      key: fields.key?.value ?? tag(event, 'key'),
      status: fields.status?.value ?? DEFAULT_PROJECT_STATUS,
      // Any non-empty value means archived; unarchiving writes an empty string
      // rather than deleting the change, because an append-only stream has no
      // undo and "set to nothing" is a fact like any other.
      archived: !!fields.archived?.value,
      fields,
    })
  }

  const issues: Issue[] = []
  for (const [address, event] of issueRoots) {
    const fields = folded.get(address) ?? {}
    // The spec puts the parent project in an `a` tag, and NIP-22-style comments
    // would also use `a`. Only a project address can be the parent, so match on
    // the kind prefix instead of taking the first `a` we see.
    const parent = tags(event, 'a').find((value) => value.startsWith(`${KIND.PROJECT}:`))
    issues.push({
      addr: address,
      id: tag(event, 'd')!,
      author: event.pubkey,
      createdAt: event.created_at,
      title: fields.title?.value ?? tag(event, 'title') ?? '(untitled issue)',
      description: fields.description?.value ?? recordDescription(event),
      descriptionFormat: fields.description?.format ?? contentFormatOf(event),
      summary: fileSummary(fields, event),
      folder: tag(event, 'h') ?? '',
      projectAddr: fields.project?.value ?? parent,
      /*
        Folded, seeded from the root tag — the same shape as a project's `lead`
        above, and `ref` was the one field on an issue that was not.

        It mattered the moment something other than Ship created an issue. A
        display key is derived from the project's title and a count of its
        siblings, so only the owning app can compute one; and an owning app
        cannot rewrite a root it did not sign, because a NIP-33 address is
        `(kind, pubkey, d)`. Reading the tag alone therefore meant an issue
        created from another app could never acquire a ref at all — it showed a
        dash for ever, while its status and assignee arrived normally, because
        those were already folded.

        Nobody had noticed the asymmetry because Ship created every issue.
      */
      ref: fields.ref?.value ?? tag(event, 'ref'),
      status: fields.status?.value ?? DEFAULT_ISSUE_STATUS,
      assignee: fields.assignee?.value,
      fields,
    })
  }

  const messages: Message[] = []
  for (const event of events) {
    const message = parseMessage(event, resolveRefs)
    if (message) messages.push(message)
  }
  const conversations = foldConversations(messages)

  const byNewest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt
  projects.sort(byNewest)
  issues.sort(byNewest)

  return { projects, issues, activity: changes, conversations }
}
