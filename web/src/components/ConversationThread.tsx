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
  author: { name?: string; picture?: string }
  /** Seconds. */
  at: number
  body: string
}

export interface ThreadData {
  id: string
  root: MessageData
  replies: MessageData[]
}

export function MessageCard({ message, reply = false }: { message: MessageData; reply?: boolean }) {
  return (
    <article className={cn('flex flex-col gap-1 py-1.5', reply && 'ml-3.5 border-l-2 border-border-default pl-2.5')}>
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

export function ConversationThread({ thread, onReply }: { thread: ThreadData; onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface px-3 py-2.5">
      <MessageCard message={thread.root} />
      {thread.replies.map((reply) => (
        <MessageCard key={reply.id} message={reply} reply />
      ))}
      <Composer kind="reply" onSubmit={(text) => onReply(thread.id, text)} className="ml-3.5 mt-1" />
    </div>
  )
}

export interface ConversationsProps {
  threads: ThreadData[]
  onStart: (text: string) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  className?: string
}

export function Conversations({ threads, onStart, onReply, className }: ConversationsProps) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <Composer onSubmit={onStart} className="mb-1" />
      {threads.length ? (
        threads.map((thread) => <ConversationThread key={thread.id} thread={thread} onReply={onReply} />)
      ) : (
        <EmptyState className="py-8" message="No conversations yet." />
      )}
    </div>
  )
}
