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
import type { SignedEvent } from '../lib/nostr/events'
import { DEFAULT_ISSUE_STATUS, DEFAULT_PROJECT_STATUS, KIND } from './kinds'

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
 * ±1 second of slack, not zero, so an implementation that rounds rather than
 * floors still gets the finer resolution.
 */
function orderingMs(event: { createdAt: number; ts?: number }): number {
  if (event.ts !== undefined && Math.abs(Math.floor(event.ts / 1000) - event.createdAt) <= 1) {
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
 * Later effective time wins. On a tie the lower event id wins — NIP-01's own
 * tie-break for replaceable events, reused here so the two rules never
 * disagree. With millisecond resolution a genuine tie now means two people
 * acting in the same millisecond, which is the case §7.4 actually had in mind.
 *
 * The property that matters: this is a total order over events, so every client
 * folds to the same answer without talking to any other client.
 */
function wins(a: Ordered, b: Ordered): boolean {
  const [at, bt] = [orderingMs(a), orderingMs(b)]
  if (at !== bt) return at > bt
  return a.id < b.id
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
  /** Optional human note from `.content`. */
  note: string
}

/** Fields on a Project or Issue that changes are allowed to set. */
export type FoldedFields = Record<string, { value: string; by: string; at: number }>

export interface Project {
  addr: string
  id: string
  author: string
  createdAt: number
  title: string
  description: string
  /**
   * The Folder this project *is* — where its issues and conversation live.
   *
   * Normally the project record's own `h`. A `kind:1851` on the `folder` field
   * overrides it, which is the only way to re-point a project at an existing
   * Peek topic after creation: an event cannot change its own `h`.
   */
  contentFolder: string
  /**
   * The Folder the project record itself was written into.
   *
   * Kept separately from `contentFolder` because a re-link overrides the latter,
   * and this one is where the project's older issues still live.
   */
  originFolder: string
  lead?: string
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
    note: event.content,
  }
}

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
    const candidate = { createdAt: event.created_at, id: event.id }
    if (!held || wins(candidate, { createdAt: held.created_at, id: held.id })) {
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
    fields[change.field] = { value: change.value, by: change.author, at: change.createdAt }
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

/**
 * Every Folder a project has ever pointed at, oldest first.
 *
 * Not just the current one. Re-linking a project to a different Folder — say,
 * to the Peek topic it should have been paired with from the start — does not
 * move the issues already filed under the old `h`; nothing can, because an
 * event is immutable. Reading the union is the difference between "the issues
 * are still there" and "the issues vanished when we linked the topic".
 *
 * Takes the change stream rather than querying, so it stays pure and the caller
 * decides how much history it has.
 */
export function projectFolders(project: Project, activity: Change[]): string[] {
  const seen: string[] = []
  const add = (value?: string) => {
    if (value && !seen.includes(value)) seen.push(value)
  }
  add(project.originFolder)
  for (const change of activity) {
    if (change.target === project.addr && change.field === 'folder') add(change.value)
  }
  add(project.contentFolder)
  return seen
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
  const changes: Change[] = []
  for (const event of events) {
    const change = parseChange(event)
    if (change) changes.push(change)
  }
  // Oldest first, in exactly the total order the fold replays, so the activity
  // feed can never disagree with the state it produced.
  changes.sort(byOrder)

  const folded = foldChanges(changes)

  const projects: Project[] = []
  for (const [address, event] of latestPerAddress(events, KIND.PROJECT)) {
    const fields = folded.get(address) ?? {}
    projects.push({
      addr: address,
      id: tag(event, 'd')!,
      author: event.pubkey,
      createdAt: event.created_at,
      // A change may rename an object. The root still holds the author's title;
      // a change overrides it, because a rename by someone else has nowhere
      // else to live.
      title: fields.title?.value ?? tag(event, 'title') ?? '(untitled project)',
      description: fields.description?.value ?? event.content,
      // The project's Folder is its own `h` — the Folder *is* the project. A
      // change may re-point it at an existing Peek topic; that override wins,
      // but the original still has to be read (see `projectFolders`).
      contentFolder: fields.folder?.value ?? tag(event, 'h') ?? '',
      originFolder: tag(event, 'h') ?? '',
      lead: fields.lead?.value ?? tag(event, 'lead'),
      status: fields.status?.value ?? DEFAULT_PROJECT_STATUS,
      // Any non-empty value means archived; unarchiving writes an empty string
      // rather than deleting the change, because an append-only stream has no
      // undo and "set to nothing" is a fact like any other.
      archived: !!fields.archived?.value,
      fields,
    })
  }

  const issues: Issue[] = []
  for (const [address, event] of latestPerAddress(events, KIND.ISSUE)) {
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
      description: fields.description?.value ?? event.content,
      folder: tag(event, 'h') ?? '',
      projectAddr: fields.project?.value ?? parent,
      ref: tag(event, 'ref'),
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
