import type { Imeta } from '@estiva-app/protocol'
import type { ThreadData } from './ConversationThread'
import type { Answer, Picks } from './conversations/shared'

/**
 * **Activity: the conversations of files *related* to this one** — CON-9.
 *
 * The model and its types. The list is drawn by `MentionList`
 * (`conversations/ThreadList.tsx`), under "Mentioned in" on a page's Activity
 * tab, with the relation's words in `conversations/shared.tsx`.
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
/**
 * Since PEE-26 Ship's pages produce only `mention`: a sub-file's threads are read
 * on the sub-file. `sub-file` stays drawable here for another app's relation.
 */
export type Relation = 'mention' | 'sub-file'

export interface ActivityItem {
  thread: ThreadData
  relation: Relation
  /**
   * The file this thread belongs to, in words a reader recognises — a project
   * title, an issue's ref. Absent when Ship cannot name it, which is ordinary:
   * a Folder that is no project's — a top-level Folder's own chat, an old Peek
   * topic channel — is a Folder and nothing else, and inventing a name for it
   * would be worse than saying nothing.
   */
  where?: string
  /** What `where` is, when Ship knows: a project or an issue, so it can be drawn with that one's icon. */
  whereKind?: 'project' | 'issue'
  /** Why this thread takes no reply or reaction: the file it is on is archived (Decided 2026-10-17). */
  closed?: string
}

export interface ActivityProps {
  items: ActivityItem[]
  /** The address of the file the page is on: its links here keep their chip and draw no card (Miky, WID-3). */
  about?: string
  /** The viewer's pubkey, for §6.5's Edit and Delete rule — see `ConversationsProps.viewer`. */
  viewer?: string
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** Why nothing can be posted right now — every composer here is disabled with it. */
  disabledReason?: string
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  /** Add or take back a reaction on a message in one of these threads — CON-2. */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<Answer>
  /**
   * Publish a deletion for one message — CON-3.
   *
   * Offered here too, and deliberately: an Activity thread belongs to another
   * file, but a message is a message wherever it is read, and who may delete
   * it is the relay's question rather than this surface's. Hiding the control
   * on the roll-up would make it depend on where you happened to be standing.
   */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /** Publish an edit of one message — CON-4. Offered here for the same reason delete is. */
  onEditMessage?: (messageId: string, body: string, removeCard?: string) => Promise<Answer>
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
