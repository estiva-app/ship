import { useMemo } from 'react'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { ConversationThread, useThreadReactions, useThreadReferences, type ThreadData } from './ConversationThread'

/**
 * **Activity: the conversations of files *related* to this one** — CON-9.
 *
 * The model agreed 2026-09-05 replaces a growing list of modes with two lists,
 * and one rule decides which a thread lands in:
 *
 * > Identity merges; relation aggregates.
 *
 * A thread about *this* file — including one on a file declared to be the same
 * thing as it — is this file's own conversation and belongs in `Conversations`.
 * A thread about something merely *related* aggregates here, and how it became
 * related is metadata on the row rather than a list of its own.
 *
 * That is why this is one time-ordered list with a relation on each row, and
 * not one section per relation. A third-party app can render this surface
 * without knowing which relation types exist yet: an unfamiliar one is still a
 * row with a label.
 *
 * ## The two relations do not carry the same trust, and the row says so
 *
 * A **mention** is anyone typing your address. It arrives retroactively, often
 * by accident, and because message content is immutable it can never be
 * withdrawn (§5.2). A **sub-file**'s conversation is your own subtree. Same
 * list is right; same weight is not, and a stranger's name-drop must not sit
 * indistinguishably beside your project's own work — so a mention is drawn
 * muted, and its provenance is on the row rather than inferred from position.
 *
 * ## Replies go to the file the thread belongs to
 *
 * Never to the file you are looking at. That falls out of the data rather than
 * being enforced here — `reply()` publishes into `conversation.root.folder` —
 * but the row names where it is going, because a composer whose destination is
 * a different object than the page around it is otherwise a trap.
 *
 * ## What it is not
 *
 * Not `History`, which is this object's own change events and was called
 * `ActivityFeed` until this ticket. Two sections on one page cannot both be
 * Activity; REW-4 keeps history and conversation apart and this does not
 * disturb that.
 */
export type Relation = 'mention' | 'sub-file'

/**
 * The words, in one place.
 *
 * *"Mentioned in"* is SPEC §6.4's own phrase for the secondary section, kept
 * verbatim so the screen and the specification cannot drift into two names for
 * one thing.
 */
const RELATION: Record<Relation, { label: string; muted: boolean }> = {
  mention: { label: 'Mentioned in', muted: true },
  'sub-file': { label: 'On an issue', muted: false },
}

export interface ActivityItem {
  thread: ThreadData
  relation: Relation
  /**
   * The file this thread belongs to, in words a reader recognises — a project
   * title, an issue's ref. Absent when Ship cannot name it, which is ordinary:
   * a Peek topic that is paired with no project is a Folder and nothing else,
   * and inventing a name for it would be worse than saying nothing.
   */
  where?: string
}

export interface ActivityProps {
  items: ActivityItem[]
  onReply: (threadId: string, text: string) => Promise<boolean | void> | boolean | void
  /** Why nothing can be posted right now — every composer here is disabled with it. */
  disabledReason?: string
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  /**
   * How many threads the horizon left out — `ACTIVITY_HORIZON`.
   *
   * Reported rather than implied. CON-1's finding is that an undocumented cap
   * is indistinguishable from "nobody reacted"; here it would be
   * indistinguishable from "nothing else happened", which is worse because a
   * project roll-up is exactly where a reader looks to find out.
   */
  truncated?: number
  className?: string
}

export function Activity({ items, onReply, disabledReason, nameOf, truncated = 0, className }: ActivityProps) {
  const threads = useMemo(() => items.map((item) => item.thread), [items])
  const { resolved, resolving } = useThreadReferences(threads)
  /* Activity's threads belong to other files, and a reaction is a property of
     the message wherever it is read — so they carry theirs too. */
  const { reactionsBy } = useThreadReactions(threads)

  if (!items.length) {
    return (
      <EmptyState
        className={cn('py-8', className)}
        message="Nothing related yet. Conversations that mention this, and conversations on its issues, appear here."
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <ol className="flex flex-col gap-2.5">
        {items.map((item) => {
          const relation = RELATION[item.relation]
          return (
            <li key={item.thread.id} className="flex flex-col gap-1" data-relation={item.relation}>
              <div className="flex items-center gap-2">
                <Chip type="neutral" label={relation.label} />
                {item.where && <span className="truncate text-caption text-text-muted">{item.where}</span>}
              </div>
              {/* The same card `Conversations` draws, deliberately — a thread
                  looks like a thread wherever it is read, and re-typing the card
                  here would be the second copy UI-RULES §1 calls a component. */}
              <ConversationThread
                thread={item.thread}
                onReply={onReply}
                disabledReason={disabledReason}
                resolved={resolved}
                resolving={resolving}
                nameOf={nameOf}
                reactionsBy={reactionsBy}
                subdued={relation.muted}
              />
            </li>
          )
        })}
      </ol>
      {/*
        What this list could not see, said rather than implied.

        Two readers open the same object and honestly see different numbers,
        because a mentioning conversation in a Folder they cannot read is absent
        — no count, no locked row, no placeholder (§6.4). The inconsistency is
        the privacy working, and a global count would "fix" it by leaking the
        existence of a private discussion. So the honest move is to decline to
        present the length as authoritative, which is what this line does.
      */}
      <p className="text-caption text-text-muted">
        {truncated > 0 && `The ${items.length} most recent, of ${items.length + truncated}. The rest are on the issues themselves. `}
        What this reader can see. Conversations in Folders you cannot read are absent, without being counted.
      </p>
    </div>
  )
}
