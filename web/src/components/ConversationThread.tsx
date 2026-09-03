import { Fragment } from 'react'
import type { BlockAnchor } from '@estiva-app/protocol'
import { BlockAnchorNote } from './ui/BlockAnchorNote'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Composer } from './Composer'

/**
 * Conversations as production shows them: a composer to start one, then
 * each thread as its own CARD — a hairline border, the surface background,
 * 10×12 padding (Katerina, 2026-08-27: "production has a different
 * background") — holding its root, its replies one level in behind a left
 * rule, and a reply line. Flat within a thread, as Peek shows them; never
 * deeper. Cards sit 10px apart.
 *
 * A message is a face and a name, the time, the body. The body is untrusted
 * text from other people and other apps: rendered as text, never as markup,
 * with a client's trailing `nostr:naddr…` reference already stripped by the
 * caller. Ship-only: it knows what a thread is.
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
  body: string
  /** Author pubkey. Only used to decide unread — your own writing is never new. */
  by?: string
}

export interface ThreadData {
  id: string
  root: MessageData
  replies: MessageData[]
}

export function MessageCard({ message, reply = false }: { message: MessageData; reply?: boolean }) {
  return (
    <article className={cn('flex flex-col gap-1 py-1.5', reply && 'ml-3.5 border-l-2 border-border-default pl-2.5')}>
      <BlockAnchorNote anchor={message.anchor} />
      <div className="flex items-center gap-1.5 text-caption text-text-muted">
        <Avatar name={message.author.name} src={message.author.picture} size={18} />
        <span className={cn('truncate', message.author.name ? 'text-text-secondary' : 'text-text-muted')}>{message.author.name ?? '—'}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{ago(message.at)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-body-2 text-text-primary">{message.body}</p>
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
      <span className="h-px flex-1 bg-accent-default/40" />
      <span className="shrink-0 text-caption text-accent-default">New since you last read this</span>
      <span className="h-px flex-1 bg-accent-default/40" />
    </div>
  )
}

export function ConversationThread({ thread, onReply, disabledReason, unreadFrom }: { thread: ThreadData; onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void; disabledReason?: string; unreadFrom?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface px-3 py-2.5">
      {unreadFrom === thread.root.id && <NewSinceHere />}
      <MessageCard message={thread.root} />
      {thread.replies.map((reply) => (
        <Fragment key={reply.id}>
          {unreadFrom === reply.id && <NewSinceHere />}
          <MessageCard message={reply} reply />
        </Fragment>
      ))}
      <Composer kind="reply" onSubmit={(text) => onReply(thread.id, text)} disabledReason={disabledReason} className="ml-3.5 mt-1" />
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
  className?: string
}

export function Conversations({ threads, onStart, onReply, disabledReason, className, unread, anchoredTo, onClearAnchor }: ConversationsProps) {
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
      <Composer onSubmit={onStart} disabledReason={disabledReason} className="mb-1" />
      {threads.length ? (
        threads.map((thread) => (
          <ConversationThread key={thread.id} thread={thread} onReply={onReply} disabledReason={disabledReason} unreadFrom={unread?.[thread.id]} />
        ))
      ) : (
        <EmptyState className="py-8" message="No conversations yet." />
      )}
    </div>
  )
}
