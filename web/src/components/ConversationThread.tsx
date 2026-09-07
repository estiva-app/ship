import { Fragment, useMemo } from 'react'
import type { BlockAnchor } from '@estiva-app/protocol'
import { referencesIn, standaloneReference, toRenderTree } from '@estiva-app/protocol'
import { BlockAnchorNote } from './ui/BlockAnchorNote'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { RichText } from '@/components/ui/RichText'
import { SkeletonBar } from '@/components/ui/Skeleton'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { Composer } from './Composer'
import { draftKeys } from '@/lib/drafts'
import { Reactions } from './Reactions'
import { useReactions, REACTION_TARGET_LIMIT } from '@/api'
import type { Reaction } from '@/api'

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
 * **The screenshots half of that report is not fixed here and cannot be fixed
 * in Ship.** Peek's outbox publishes `content: m.body` and nothing else
 * (`convex/nostr/outbox.ts`); an attachment lives in Convex storage and never
 * reaches the relay, so there is no image for any other reader to draw. That is
 * Peek's publish path, not Ship's rendering.
 */
export interface MessageData {
  id: string
  /**
   * Which block of the object this comment is about, already resolved against
   * the description as it is now — SPEC §13.6. Resolved by the caller because
   * only the page holds the description; see `threadFor`.
   */
  anchor?: BlockAnchor
  author: { name?: string; picture?: string }
  /** Seconds. */
  at: number
  /**
   * The body as it was published, minus the pointer at the object whose page
   * this is — see `omitOwnReference`. Every other reference is still in here
   * and is drawn as the object it names, not deleted.
   */
  body: string
  /** Author pubkey. Only used to decide unread — your own writing is never new. */
  by?: string
}

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
const MESSAGE_FORMAT = 'marker' as const

/** Every `nostr:` pointer in a set of messages, deduplicated, in the order they appear. */
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
  refresh: () => void
} {
  const ids = useMemo(
    () =>
      threads
        .flatMap((thread) => [thread.root, ...thread.replies])
        .sort((a, b) => a.at - b.at)
        .map((message) => message.id),
    [threads],
  )
  const { reactions, omitted, refresh } = useReactions(ids)
  return { reactionsBy: reactions, omitted, refresh }
}

export interface ThreadData {
  id: string
  root: MessageData
  replies: MessageData[]
}

export function MessageCard({
  message,
  reply = false,
  resolved,
  resolving = false,
  nameOf,
  reactions,
  onToggleReaction,
  disabledReason,
}: {
  message: MessageData
  reply?: boolean
  /** The thread's references, resolved once by `Conversations` — RIC-10's rule. */
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** The first resolve is still in flight, so an attachment gets a skeleton rather than nothing. */
  resolving?: boolean
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  /** This message's reactions, read by target — SPEC §6.6. */
  reactions?: readonly Reaction[]
  /** Add or take back a reaction on this message. Omitted where nobody may write. */
  onToggleReaction?: (emoji: string, mine?: string) => void
  /** Why nothing can be written right now. */
  disabledReason?: string
}) {
  const blocks = toRenderTree(message.body, MESSAGE_FORMAT)
  // A block that is nothing but one pointer is an attachment and is drawn
  // below; one inside a sentence is drawn where it was written (RIC-10).
  const attached = blocks.map(standaloneReference).filter((r): r is string => !!r)
  const attachments = attached.map((r) => resolved?.[r]).filter((o): o is ForeignObjectData => !!o)
  return (
    <article className={cn('flex flex-col gap-1 py-1.5', reply && 'ml-3.5 border-l-2 border-border-default pl-2.5')}>
      <BlockAnchorNote anchor={message.anchor} />
      <div className="flex items-center gap-1.5 text-caption text-text-muted">
        <Avatar name={message.author.name} src={message.author.picture} size={18} />
        <span className={cn('truncate', message.author.name ? 'text-text-secondary' : 'text-text-muted')}>{message.author.name ?? '—'}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{ago(message.at)}</span>
      </div>
      <RichText
        value={message.body}
        format={MESSAGE_FORMAT}
        /*
          Hide a standalone pointer only while there is still a card coming for
          it. `null` is the relay's real answer that nothing resolved — no card
          will be drawn below, so the chip stays and the message says something
          rather than rendering as a name and a time over a blank line. That is
          the half of SHI-1 a description never had to care about.
        */
        hideStandalone={(reference) => resolved?.[reference] !== null}
        nameOf={nameOf}
        resolved={resolved}
        className="break-words text-body-2 text-text-primary"
      />
      {attached.length > 0 && resolving && <SkeletonBar className="h-16 w-full rounded-lg" data-foreign-references="loading" />}
      {attachments.length > 0 && (
        <div className="flex flex-col gap-2" data-foreign-references={String(attachments.length)}>
          {attachments.map((object) => (
            <ForeignObject key={object.ref} object={object} />
          ))}
        </div>
      )}
      {/* Under the body, above nothing — a reaction is about the message that
          precedes it, and it sits inside the article so it moves with it. */}
      <Reactions reactions={reactions} nameOf={nameOf} onToggle={onToggleReaction} disabledReason={disabledReason} />
    </article>
  )
}

/**
 * Where "new since you looked" begins (CRO-13).
 *
 * A rule rather than a badge: the divider sits above the first message the
 * reader has not seen, and everything below it is new. Ship's lists stay clean —
 * the signal lives where the reading happens.
 */
function NewSinceHere() {
  return (
    <div className="flex items-center gap-2 py-1" role="separator" aria-label="New since you last read this">
      <span className="h-px flex-1 bg-accent-muted" />
      <span className="shrink-0 text-caption text-accent-primary">New since you last read this</span>
      <span className="h-px flex-1 bg-accent-muted" />
    </div>
  )
}

export function ConversationThread({ thread, onReply, disabledReason, unreadFrom, resolved, resolving, nameOf, reactionsBy, onReact, subdued = false }: { thread: ThreadData; onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void; disabledReason?: string; unreadFrom?: string; resolved?: Record<string, ForeignObjectData | null | undefined>; resolving?: boolean; nameOf?: (pubkey: string) => string; /** Reactions by message id, read once for the surface. */ reactionsBy?: Record<string, readonly Reaction[]>; /** Add or take back a reaction on one message. */ onReact?: (messageId: string, emoji: string, mine?: string) => void; /** Draw it as secondary — Activity's mentions, which do not carry a comment's trust (CON-9). */ subdued?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border px-3 py-2.5',
        // The card recedes rather than fading: `border-subtle` on the page's own
        // ground, both tokens, so it stays legible in either theme. An opacity
        // utility would have dimmed the text with it — UI-RULES §4.
        subdued ? 'border-border-subtle bg-bg-base' : 'border-border-default bg-bg-surface',
      )}
    >
      {unreadFrom === thread.root.id && <NewSinceHere />}
      <MessageCard message={thread.root} resolved={resolved} resolving={resolving} nameOf={nameOf} reactions={reactionsBy?.[thread.root.id]} onToggleReaction={onReact && ((emoji, mine) => onReact(thread.root.id, emoji, mine))} disabledReason={disabledReason} />
      {thread.replies.map((reply) => (
        <Fragment key={reply.id}>
          {unreadFrom === reply.id && <NewSinceHere />}
          <MessageCard message={reply} reply resolved={resolved} resolving={resolving} nameOf={nameOf} reactions={reactionsBy?.[reply.id]} onToggleReaction={onReact && ((emoji, mine) => onReact(reply.id, emoji, mine))} disabledReason={disabledReason} />
        </Fragment>
      ))}
      <Composer kind="reply" onSubmit={(text) => onReply(thread.id, text)} disabledReason={disabledReason} draftKey={draftKeys.thread(thread.id)} className="ml-3.5 mt-1" />
    </div>
  )
}

export interface ConversationsProps {
  threads: ThreadData[]
  /** Thread id → the id of its first unread message. Omitted threads have nothing new. */
  unread?: Record<string, string>
  onStart: (text: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  /** Why nothing can be posted right now — every composer here is disabled with it. */
  disabledReason?: string
  /** The block the next comment will be anchored to, if one was chosen — §13.6. */
  anchoredTo?: string
  onClearAnchor?: () => void
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
  className?: string
}

export function Conversations({ threads, onStart, onReply, disabledReason, className, unread, anchoredTo, onClearAnchor, nameOf, about, onReact }: ConversationsProps) {
  const { resolved, resolving } = useThreadReferences(threads)
  const { reactionsBy, omitted, refresh: refreshReactions } = useThreadReactions(threads)

  /* Publish, then ask the relay again — never patch the count locally. The
     relay is the authority on whether a reaction happened, and `act` already
     keeps that rule for every other write here; a pill that moved on click and
     then snapped back would be worse than one that takes a moment. */
  const react = onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        await onReact(messageId, emoji, mine)
        refreshReactions()
      }
    : undefined

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {/* Say what the next comment will be attached to, and offer to undo it.
          A choice made by clicking somewhere else on the page is invisible
          otherwise, and an anchor nobody meant to set is worse than none. */}
      {anchoredTo && (
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <span>Commenting on one part of the description.</span>
          <button type="button" onClick={onClearAnchor} className="underline hover:text-text-primary">
            Comment on the whole issue instead
          </button>
        </div>
      )}
      <Composer onSubmit={onStart} disabledReason={disabledReason} draftKey={about && draftKeys.object(about)} className="mb-1" />
      {threads.length ? (
        threads.map((thread) => (
          <ConversationThread
            key={thread.id}
            thread={thread}
            onReply={onReply}
            disabledReason={disabledReason}
            unreadFrom={unread?.[thread.id]}
            resolved={resolved}
            resolving={resolving}
            nameOf={nameOf}
            reactionsBy={reactionsBy}
            onReact={react}
          />
        ))
      ) : (
        <EmptyState className="py-8" message="No conversations yet." />
      )}
      {/*
        The horizon, said out loud — CON-1.

        §6.6's finding is that the cap is invisible: a message past it looks
        exactly like a message nobody reacted to. On this workspace it has never
        bitten (the busiest page is 77 messages against a limit of 100), which
        is precisely why the line has to exist before it does.
      */}
      {omitted > 0 && (
        <p className="text-caption text-text-muted">
          Reactions are shown for the {REACTION_TARGET_LIMIT} most recent messages. {omitted} older{' '}
          {omitted === 1 ? 'message was' : 'messages were'} not checked.
        </p>
      )}
    </div>
  )
}
