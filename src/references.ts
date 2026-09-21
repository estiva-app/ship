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
 * So `foldFolder` is untouched and this is additive. `estiva-agent` gets the
 * file by copy like the rest of `src/`, and nothing it already does changes.
 *
 * ## What counts as an anchor — §6.4's per-tag rule (CON-13)
 *
 * Not every `a` tag is the object a thread is about. Since RIC-11 and peek#272
 * a message carries every `nostr:naddr…` its body names as an `a` tag as well —
 * the body is what the person wrote, the tag is the index that lets one `#a`
 * filter answer *who named this file* — so a Peek comment written on a file
 * that names a Ship issue carries the issue as `a`, and reading that as a
 * comment put another file's discussion inside the issue's own. §6.4 says which
 * tag carries which strength, and this is that table:
 *
 * - A `kind:1111`'s `A` is the comment. NIP-22's uppercase names the thread
 *   root, and a comment is about one object. Its `a` tags are read only when it
 *   has no `A` at all — malformed, and absent from production — and any `a`
 *   that is not the `A` is a mention, because NIP-22 makes a root's own
 *   lowercase pair equal its uppercase one and so any other `a` is a reference.
 * - A `kind:9`'s `a` is the comment when the body does **not** name it — the
 *   anchor of a comment written before REW-10 moved comments to `1111`, which
 *   nothing writes any more and which is not replaceable, so it is read for
 *   good (112 threads on production, 2026-09-21). One the body *does* name is
 *   the index of that reference: a mention, on a kind that has no `A`.
 *
 * A reply's tags are never consulted below: its lowercase pair names the
 * comment being answered, or repeats what the root already said.
 */
import { findNaddrs, naddrToAddr, type SignedEvent } from '@estiva-app/protocol'
import { KIND } from './kinds'
import type { Conversation } from './fold'

/** Message id → the addresses that message is a **comment on**, by the rule above. */
export type AnchorIndex = Record<string, string[]>

/** Which of the two strengths §6.4 allows. */
export type Attachment = 'comment' | 'mention'

/** The addresses a body names, as `store.ts` reads them; a pointer that will not decode is prose. */
function namedInBody(body: string): Set<string> {
  const out = new Set<string>()
  for (const naddr of findNaddrs(body)) {
    try {
      out.add(naddrToAddr(naddr))
    } catch {
      // Not a pointer we can read, so not a reference either.
    }
  }
  return out
}

/**
 * Read the comment half of `about` back off the events.
 *
 * Keyed by message id rather than by address because the question asked of it is
 * always *"how did this thread attach"*, which is a property of the thread's
 * root message. An address-keyed index would answer the same question at the
 * cost of a scan per lookup.
 */
export function anchorIndex(events: readonly SignedEvent[]): AnchorIndex {
  const index: AnchorIndex = {}
  for (const event of events) {
    if (event.kind !== KIND.MESSAGE && event.kind !== KIND.COMMENT) continue
    const values = (name: string) => event.tags.filter((t) => t[0] === name && t[1]).map((t) => t[1])
    let anchors: string[]
    if (event.kind === KIND.COMMENT) {
      const roots = values('A')
      anchors = roots.length ? roots : values('a')
    } else {
      const named = namedInBody(event.content)
      anchors = values('a').filter((address) => !named.has(address))
    }
    if (anchors.length) index[event.id] = [...new Set(anchors)]
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
 * **A thread whose real root is missing reads as a mention.** `foldConversations`
 * stands the earliest visible message in for an absent root — truncated history,
 * or a reply that outran its parent — and that stand-in's tags are not the
 * root's. Reading it as a comment would be a guess about an event nobody here
 * has seen, and the secondary section is the safe side of that guess.
 */
export function attachmentOf(
  conversation: Conversation,
  address: string,
  anchors: AnchorIndex,
): Attachment | null {
  if (!conversation.about.includes(address)) return null
  const rootIsPresent = conversation.root.id === conversation.id
  const namedByRoot = rootIsPresent && (anchors[conversation.root.id] ?? []).includes(address)
  return namedByRoot ? 'comment' : 'mention'
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
 * Conversations that merely *name* the object, wherever they were written.
 *
 * The reverse half of RIC-12: not *"what does this body refer to"* but *"what
 * refers to this object"*. A thread in a Peek topic that names a Ship issue
 * belongs here, on the issue, and reaches it through the same tag data both apps
 * have been publishing for months — nothing new is written to the relay.
 *
 * **This list is what the reader can see, never what exists.** A mentioning
 * conversation in a Folder they cannot read is absent — no count, no locked row,
 * no placeholder — so two people open the same object and honestly see different
 * numbers, and neither is told. §6.4 accepts that deliberately: showing a global
 * count would leak the existence of a private discussion. A caller must not
 * present the length as authoritative.
 */
export function mentionsOf(
  conversations: readonly Conversation[],
  address: string,
  anchors: AnchorIndex,
): Conversation[] {
  return conversations.filter((c) => attachmentOf(c, address, anchors) === 'mention')
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
