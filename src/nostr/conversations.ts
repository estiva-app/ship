/**
 * Conversations about a project or an issue: comments and their replies.
 *
 * The thread each message belongs to is `@estiva-app/conversation`'s
 * `foldThreads`, the same fold Peek and Leaf use; this file only names
 * messages the way Ship's pages hold them.
 */
import { blockAnchorOf, quoteOf, type Quote, type SignedEvent } from '@estiva-app/protocol'
import { foldThreads, isAbout } from '@estiva-app/conversation'
import { KIND } from './kinds'

/** First value of a tag, or undefined. Tags are `[name, value, …]`. */
function tag(event: SignedEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1]
}

/** Every value of a repeated tag. */
function tags(event: SignedEvent, name: string): string[] {
  return event.tags.filter((t) => t[0] === name).map((t) => t[1])
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
export function conversationsOf(messages: Message[]): Conversation[] {
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
