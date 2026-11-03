/**
 * How a conversation became attached to an object — SPEC §6.4, CON-7.
 *
 * §6.4 has always said a thread belongs to whatever anyone in it referenced, at
 * any point, and that the **whole** thread attaches rather than only the message
 * carrying the reference. The amendment of 2026-08-31 says why that is
 * defensible: attachment has two strengths and an app MUST present them
 * separately.
 *
 * | | in the data | presented as |
 * | --- | --- | --- |
 * | **a comment** | uppercase `A` at the thread root — the thread *is* about this object | the object's own discussion |
 * | **a mention** | an `a` tag on the root that is not its `A`, or an address in a body | *Mentioned in*, secondary and collapsed |
 *
 * `conversationsAbout` in `fold.ts` returns the union of both, because
 * `Conversation.about` is itself a union: `parseMessage` merges an event's `a`
 * tags with the addresses found in its body, and `foldConversations` then merges
 * that across every message in the thread. Two facts are lost on the way in, and
 * this file is where they are read instead.
 *
 * ## Why it reads the events rather than adding a field to the fold
 *
 * The fold's output is a contract between two repositories.
 * `scripts/conformance.test.ts` compares `foldFolder`'s whole result against a
 * recorded state, walking the **union of keys** — so one new field on `Message`
 * turns both repos' CI red until a regenerated fixture lands in both at once.
 * That is the correct amount of friction for changing what the fold *means*, and
 * this does not change it: the same events fold to the same state, and this is a
 * second, separate reading of the same input.
 *
 * So `foldFolder` is untouched and this is additive.
 *
 * ## What counts as an anchor is `@estiva-app/conversation`'s (CON-5)
 *
 * §6.4's per-tag rule lived here until CON-5 and now lives in the package,
 * as `isCommentOn`: a `kind:1111`'s `A` (every `a` when it has none), never a
 * reply, and **never a `kind:9`** — CON-20 republished every comment-shaped
 * `kind:9` as a `kind:1111`, and this manifest declares no `alsoRead`, so
 * the pre-REW-10 row this file used to read is gone. What stays here is
 * Ship's shape: an index over the fold's `Conversation`s.
 */
import { anchorsOf, isReply, type Strength } from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'
import type { Conversation } from './fold'

/**
 * Message id → the addresses that message is a **comment on**, by SPEC §6.4.
 *
 * And, under `replyKey(id)`, each NIP-22 reply's thread object (its `A`, which a
 * reply copies from its comment, §6.4 *Replies*): read only when the thread's
 * root is gone, to know whose comment it was (`attachmentOf`).
 */
export type AnchorIndex = Record<string, string[]>

/** Where a reply's thread object is kept in the index, apart from the comments' own entries. */
export const replyKey = (id: string) => `reply:${id}`

/** Which of the two strengths §6.4 allows. */
export type Attachment = Strength

/**
 * Read the comment half of `about` back off the events: each root's
 * `anchorsOf`, the package's reading of §6.4. Keyed by message id because the
 * question asked of it is always *"how did this thread attach"*.
 */
export function anchorIndex(events: readonly SignedEvent[]): AnchorIndex {
  const index: AnchorIndex = {}
  for (const event of events) {
    const anchors = anchorsOf(event)
    if (!anchors.length) continue
    if (isReply(event)) index[replyKey(event.id)] = anchors
    else index[event.id] = anchors
  }
  return index
}

/**
 * How this conversation attaches to this object, or `null` if it does not.
 *
 * **The root's tags decide it, and nothing else does.** A tag on a reply is
 * either NIP-22 repeating what the root already said or an app naming the
 * comment being answered; neither is the thread declaring what it is about.
 * That is what puts the twenty-message thread naming an issue on message
 * twenty-one under *Mentioned in* rather than inside the issue's comments,
 * which §5.1 calls indefensible.
 *
 * **A thread whose real root is missing is a comment when its replies say so.**
 * `foldConversations` stands the earliest visible message in for an absent root
 * — a deleted comment, truncated history, or a reply that outran its parent —
 * and that stand-in's own tags are not the root's. But a NIP-22 reply carries
 * its thread's object as its `A`, copied from the comment it answers (§6.4
 * *Replies*), so a `kind:1111` stand-in says whose comment it was without a
 * guess, and the thread stays in that file's comments as Peek keeps it ("This
 * comment was deleted.", PER-24; Katerina, 2 November). A stand-in with no such
 * tag — a `kind:9`, chat — still reads as a mention: the secondary section is
 * the safe side of a guess.
 */
export function attachmentOf(
  conversation: Conversation,
  address: string,
  anchors: AnchorIndex,
): Attachment | null {
  if (!conversation.about.includes(address)) return null
  const rootIsPresent = conversation.root.id === conversation.id
  // A stand-in answering the root itself carries `e` = `E` and is indexed as a comment on that message, under its own
  // id; one answering a reply, under `replyKey`. Either way its `A` is the thread's object.
  const named = rootIsPresent ? anchors[conversation.root.id] : (anchors[conversation.root.id] ?? anchors[replyKey(conversation.root.id)])
  return (named ?? []).includes(address) ? 'comment' : 'mention'
}

/**
 * The object's own discussion: threads whose root declares them to be about it.
 *
 * This is what `conversationsAbout` was being used for at every call site, and
 * what it was not: an accidental mention attaches **permanently**, because
 * message content is immutable and §5.2 gives no way to withdraw one. Acceptable
 * for a secondary section, indefensible for the primary one.
 */
export function commentsOn(
  conversations: readonly Conversation[],
  address: string,
  anchors: AnchorIndex,
): Conversation[] {
  return conversations.filter((c) => attachmentOf(c, address, anchors) === 'comment')
}

/**
 * Comments on **any** of a set of objects, each paired with the one it is about
 * — the sub-file roll-up half of Activity (CON-9).
 *
 * A project's Activity is the conversations of its issues, and that data exists
 * today: an issue names its project, and its comments name the issue. No new
 * protocol, no folder nesting, nothing to publish.
 *
 * **One pass over the conversations, not one per object.** The naive shape is
 * `for (const issue of issues) commentsOn(conversations, issue.addr, …)`, which
 * on production's 229 issues and 495 conversations is over a hundred thousand
 * `about.includes` calls to answer a question about one project. This walks the
 * conversations once and asks the set.
 *
 * Ordered by the conversations' own order, which `foldConversations` leaves
 * most-recently-active first — so a caller taking a horizon off the front takes
 * the most recent, which is the only cut worth having.
 */
export function commentsOnAny(
  conversations: readonly Conversation[],
  addresses: ReadonlySet<string>,
  anchors: AnchorIndex,
): { conversation: Conversation; about: string }[] {
  const found: { conversation: Conversation; about: string }[] = []
  for (const conversation of conversations) {
    /*
      The root's tags, and only those — the same rule `attachmentOf` applies.
      A thread merely *mentioning* one of a project's issues is not that issue's
      comment, so it must not be rolled up as one either: doing so would let a
      passing name-drop into the primary reading of a project through a side
      door, which is the §5.1 merge in a different place.
    */
    if (conversation.root.id !== conversation.id) continue
    const named = anchors[conversation.root.id]
    if (!named) continue
    const about = named.find((address) => addresses.has(address))
    if (about) found.push({ conversation, about })
  }
  return found
}
