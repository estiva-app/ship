import { useMemo } from 'react'
import type { BlockAnchor, Embed, Imeta, PartPointer } from '@estiva-app/protocol'
import { referencesIn, toRenderTree } from '@estiva-app/protocol'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Divider } from './ui/Divider'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { useReactions } from '@/api'
import type { Reaction } from '@/api'
import type { Picks } from '@/components/conversations/MessageBox'

/**
 * Conversations as production shows them: a composer to start one, then
 * each thread as its own CARD — a hairline border, the surface background,
 * 10×12 padding (Katerina, 2026-08-27: "production has a different
 * background") — holding its root, its replies one level in behind a left
 * rule, and a reply line. Flat within a thread, as Peek shows them; never
 * deeper. Cards sit 10px apart.
 *
 * A message is a face and a name, the time, the body. The body is untrusted
 * text from other people and other apps, and it is drawn the way every other
 * body in this app is drawn — `toRenderTree` then `RichText`, safe by
 * construction (SPEC §13.5), never as markup. Ship-only: it knows what a
 * thread is.
 *
 * ## What SHI-1 was
 *
 * Katerina: *"Screenshots and reference widgets aren't rendered in conversation
 * or replies. Avatar + name + timestamp only."* The body reached here as a
 * plain `<p>`, and the caller had already deleted every `nostr:naddr…` from it
 * — so a comment whose whole content was a pointer at another object rendered
 * as an empty paragraph under a name and a time. Descriptions had had the
 * answer since PRO-7 and RIC-10; conversations had never been given it.
 *
 * `Description` is the sibling that already assembles these three pieces, and
 * the pairing is the same one: strip a standalone pointer out of the prose,
 * draw the object it names below, resolve an in-sentence pointer where it was
 * written. Showing the bech32 *and* the object is worse than either.
 *
 * **The screenshots half is answered too, now that there is something to
 * draw.** It could not be, at first: Peek's outbox published `content` and
 * nothing else, so an attachment stayed in Convex storage and never reached the
 * relay. peek#177 puts an `imeta` tag on the message (CON-12), `attachments.ts`
 * reads it back, and `Attachment` fetches the bytes — which it must, because
 * media GET is authenticated and an `<img src>` answers 401.
 */
export interface MessageData {
  id: string
  /** `9` for chat, `1111` for a comment — what a `[` reference to it carries (CON-25). */
  kind?: number
  /**
   * Which block of the object this comment is about, already resolved against
   * the description as it is now — SPEC §13.6. Resolved by the caller because
   * only the page holds the description; see `threadFor`.
   */
  anchor?: BlockAnchor
  /** `bot` is the author's profile flag, undefined when none was read — what §6.5's controls rule reads. */
  author: { name?: string; picture?: string; bot?: boolean }
  /** Seconds. */
  at: number
  /**
   * The body as it stands, minus the pointer at the object whose page this is —
   * see `omitOwnReference`. Every other reference is still in here and is drawn
   * as the object it names, not deleted.
   *
   * **This is the edited text where there is one** (CON-4). An edit changes
   * the body and its attachments (§7.2.1, amended 2026-09-23), and `threadFor`
   * applies both, so nothing below has to know an edit happened in order to
   * draw the message correctly.
   */
  body: string
  /**
   * When it was last edited, in seconds — CON-4.
   *
   * Present only for an edited message, because "edited" is a thing a reader
   * MUST be told (RFC 0.4 §7.2.1): the original event is immutable and still on
   * the relay, so a body that quietly changed would leave two readers
   * disagreeing with no way to tell which is current. An edit that changes only
   * the attachments, under byte-identical text, does not set it (CON-5).
   */
  editedAt?: number
  /** Author pubkey. Only used to decide unread — your own writing is never new. */
  by?: string
  /**
   * Files attached to this message, from its `imeta` tags — CON-12, SHI-1.
   *
   * Read beside the fold (`attachments.ts`) rather than off `Message`, for the
   * same reason as `editedAt`: `foldFolder` is a two-repo contract and a new
   * field on `Message` turns both repos red. `threadFor` supplies it.
   */
  files?: Imeta[]
  /**
   * Whom the body names urgently, by pubkey — the message's `urgent` tags
   * (SPEC §13.1, CON-24), read beside the fold for the same reason as `files`.
   */
  urgent?: string[]
  /**
   * The blocks of other objects it shows — its `part` tags (SPEC §13.6.1,
   * COM-2), read beside the fold for the same reason as `files`.
   */
  parts?: PartPointer[]
  /**
   * The cards it asks for — its `embed` tags, folded over its edits like
   * `files` (SPEC §13.6.2, OPT-16). Which of them draw is `cardsOf`'s answer.
   */
  embeds?: Embed[]
  /**
   * The block of its own object a comment is anchored to (SPEC §13.6), drawn
   * above the text with the same card as a part — Decided 2026-10-07, as Peek
   * draws it. Undefined for a comment about the whole object.
   */
  anchorPart?: PartPointer
}

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
const MESSAGE_FORMAT = 'marker' as const

/**
 * Every `nostr:` pointer in a set of messages, deduplicated, in the order they
 * appear. A card (SPEC §13.6.2) resolves under the reference the body wrote, so
 * these are its objects too.
 */
export function referencesInMessages(messages: readonly MessageData[]): string[] {
  const seen = new Set<string>()
  for (const message of messages) {
    for (const reference of referencesIn(toRenderTree(message.body, MESSAGE_FORMAT))) seen.add(reference)
  }
  return [...seen]
}

/**
 * Resolve every reference on a surface, once — for whoever is drawing threads.
 *
 * Both surfaces that draw threads need this and neither may do it per message:
 * `startConversation` appends the same pointer to every comment on an issue, so
 * a twelve-message thread would fetch one object twelve times, and because
 * `useForeignObjects` re-resolves on the page's own cadence two copies could
 * legitimately land in different states and draw the same object two ways on
 * one screen. RIC-10 extracted the hook for exactly that reason; this is the
 * thread-shaped caller of it, shared so `Conversations` and `Activity` cannot
 * drift into two answers.
 */
export function useThreadReferences(threads: readonly ThreadData[]): {
  resolved: Record<string, ForeignObjectData | null | undefined>
  resolving: boolean
} {
  const references = useMemo(
    () => referencesInMessages(threads.flatMap((thread) => [thread.root, ...thread.replies])),
    [threads],
  )
  const objects = useForeignObjects(references)
  return { resolved: byReference(references, objects), resolving: objects === undefined }
}

/**
 * The reactions on every message of a set of threads — SPEC §6.6, CON-2.
 *
 * Once per surface, not once per message: a `kind:7` is fetched addressed by
 * target, so one query covers a whole page (`#e` ORs — measured against
 * production, unlike `#h`, which does not). Asking per message would be one
 * round trip per line of conversation.
 *
 * Oldest first, because the horizon keeps the recent end when a page exceeds it
 * and the caller's order is what decides which end that is.
 *
 * Shared by `Conversations` and `Activity` for the same reason
 * `useThreadReferences` is: two copies of this would be two horizons and two
 * answers about the same messages on one screen.
 */
export function useThreadReactions(threads: readonly ThreadData[]): {
  reactionsBy: Record<string, readonly Reaction[]>
  omitted: number
  cut: boolean
  refresh: () => void
} {
  // Every root and reply with its `created_at`: the horizon is the newest 100
  // by time across both (SPEC §6.6), so the order passed no longer matters.
  const targets = useMemo(
    () => threads.flatMap((thread) => [thread.root, ...thread.replies]).map((message) => ({ id: message.id, at: message.at })),
    [threads],
  )
  const { reactions, omitted, cut, refresh } = useReactions(targets)
  return { reactionsBy: reactions, omitted, cut, refresh }
}

export interface ThreadData {
  id: string
  root: MessageData
  replies: MessageData[]
}

/**
 * The question asked before a deletion, and the three things it has to say.
 *
 * A deletion is a **request**: the relay may decline it, and copies held by
 * another relay or another app's cache are untouched. That is not hedging — it
 * is the difference between this and archiving, which is the reversible,
 * attributable operation §6.5 still puts first.
 *
 * Deleting the **root** of a thread does not delete the thread: replies are
 * separate events with their own authors, and `foldConversations` promotes the
 * earliest surviving message to stand in for a root it cannot see. So the
 * conversation carries on without its opening line, which is worth knowing
 * before rather than after.
 */
export function ConfirmDeleteMessage({
  replies,
  onConfirm,
  onClose,
}: {
  /** How many replies this message would leave behind — 0 unless it is a root. */
  replies: number
  onConfirm: () => Promise<boolean | void> | boolean | void
  onClose: () => void
}) {
  return (
    <ConfirmDialog title="Delete this message?" confirmLabel="Delete message" destructive onConfirm={onConfirm} onClose={onClose}>
      <p>
        This publishes a NIP-09 deletion request. The relay decides: it accepts one from the message&rsquo;s author, or from the
        owner of an agent that wrote it. Copies held by other relays or apps are unaffected.
      </p>
      {replies > 0 && (
        <p>
          Its {replies} {replies === 1 ? 'reply is a separate event and is' : 'replies are separate events and are'} not deleted.
          The conversation stays, opening with whichever message comes next.
        </p>
      )}
    </ConfirmDialog>
  )
}

/**
 * Where "new since you looked" begins (CRO-13).
 *
 * A rule rather than a badge: the divider sits above the first message the
 * reader has not seen, and everything below it is new. Ship's lists stay clean —
 * the signal lives where the reading happens.
 */
export function NewSinceHere() {
  // The package's labelled Divider (0.11.0, D40), in the warning colour: the
  // accent this drew in measured 3.3:1 on Ship's background and could not
  // be read (Katerina, 2026-09-08); the warning colour measures 9.6:1.
  return <Divider label="New since you last read this" tone="warning" className="mx-0 py-1" />
}

/** Thread id → the ids of its unread messages, oldest first. Omitted threads have nothing new. */
export type UnreadByThread = Readonly<Record<string, readonly string[]>>

export interface ConversationsProps {
  threads: ThreadData[]
  /**
   * Which messages were new to the reader when the page opened: the divider goes
   * above each thread's first, and a thread holding a new reply opens by itself.
   * Held for the visit, so the divider stays while it is read (99557309).
   * Undefined while read state loads: nothing is new yet.
   */
  unread?: UnreadByThread
  /** Which are still unread now: "N new" counts these, and leaves once they are read (SHI-38). Defaults to `unread`. */
  stillUnread?: UnreadByThread
  /** The text and the files already on the relay — SHI-2. See `Composer`. `blockId` when it starts from a block's menu — RIC-18. */
  onStart: (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<boolean | void> | boolean | void
  /**
   * The block the next conversation is about — chosen from a block's menu
   * (RIC-18). Drawn above the composer, as the comment will show it; posting
   * sends its id, and `onDropAnchor` takes it away.
   */
  anchor?: BlockAnchor
  onDropAnchor?: () => void
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<boolean | void> | boolean | void
  /** A thread's replies were drawn (`open`) or hidden: drawing them is what reads them, SPEC §11.2 (CON-34). */
  onThreadShown?: (threadId: string, open: boolean) => void
  /** Why nothing can be posted right now — every composer here is disabled with it. */
  disabledReason?: string
  /**
   * The viewer's pubkey. Edit and Delete are offered only on the viewer's own
   * messages — not on another person's or an agent's (SPEC §6.5, SHI-29).
   * Omitted, they are offered on nothing.
   */
  viewer?: string

  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  /**
   * The address of the object this surface is about — CON-10.
   *
   * Only the "start a conversation" composer needs it: a reply is keyed by its
   * own thread, which is the same destination wherever the thread is read.
   * Absent means no draft is kept for starting one, which is correct for a
   * surface that has no single object.
   */
  about?: string
  /**
   * Add or take back a reaction on one message — CON-2.
   *
   * Resolves when the relay has answered, so this surface can re-read rather
   * than assume. Omitted where nobody may write, which removes the controls
   * instead of disabling them.
   */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<boolean | void> | boolean | void
  /**
   * Publish a deletion for one message — CON-3.
   *
   * Resolves `false` on a refusal, which is what keeps the confirm dialog open
   * so the page's banner can carry the relay's own words. Omitted where nobody
   * may write, and the control is then absent rather than disabled.
   */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /**
   * Publish an edit of one message — CON-4.
   *
   * Resolves `false` on a refusal, which keeps the editor open with the text
   * still in it. Omitted where nobody may write, and the control is then absent
   * rather than disabled.
   */
  onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void
  className?: string
}

