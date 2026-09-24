/**
 * Where "new since you looked" goes in a conversation (CRO-13).
 *
 * Ship publishes and merges NIP-RS read state already (CRO-8) and shows none of
 * it. This is the display rule, and it is deliberately the smallest surface that
 * makes the cross-app claim observable: **a divider inside the comment feed on
 * an issue or a project — no dots in lists, nothing in the sidebar.**
 *
 * Ship is issues-first and its lists are dense tables. A dot per row would have
 * to answer "unread *of what*" for an object that is not a container and usually
 * has no discussion at all, and it would put the signal a level away from the
 * thing you act on. Inside the feed the question does not arise: the divider
 * sits above the first message you have not seen.
 *
 * ## The two grains, and why replies are not governed by their own marker alone
 *
 * SPEC §11.3: a stream's frontier propagates down, so the effective marker for
 * a reply is the **later** of its thread's own marker and its stream's — the
 * channel uuid for the Folder's chat, the file's address for comments on a
 * project or an issue (FOL-16). Marking a stream read therefore clears replies
 * that predate that moment, while a reply newer than it stays new until the
 * thread's own marker advances. What does *not* propagate is the channel's
 * marker into a file's stream: reading the project page says nothing about
 * which of its issues you have read.
 *
 * Applied here, at read time, and never written down. Writing the container's
 * value onto each thread would give the same answer today and be permanent —
 * the blob is grow-only.
 *
 * ## Absence means no divider, which is a decision and not the spec's default
 *
 * SPEC §11.6 says absence of a context means **unread**. Taken literally, Ship's
 * years of history would all be new on the first run, and the only way anyone
 * would clear that is by bulk-reading — which teaches people the marker means
 * nothing.
 *
 * So a container with no marker at all shows no divider. Nothing is published to
 * achieve it: the quiet first run costs one `undefined` check rather than a bulk
 * irreversible write over every container the person can see. The trade is that
 * a genuinely never-read old thread stays quiet until it gets activity, which is
 * the failure everybody prefers.
 */

/** The shape this needs from a rendered message. `at` is unix seconds, as NIP-RS stores. */
export interface FeedMessage {
  id: string
  at: number
  /**
   * Author pubkey — your own writing is never new to you.
   *
   * Optional because a rendered message may not carry one. Absent counts as
   * somebody else, which errs towards showing the divider: a spurious "new"
   * marker is noticed and dismissed, a missing one is never noticed at all.
   */
  by?: string
}

export interface FeedThread {
  id: string
  root: FeedMessage
  replies: FeedMessage[]
}

/**
 * The stream a thread's root answers to — SPEC §11.1 (FOL-16).
 *
 * A bare channel uuid for a root with no `a` tag (the Folder's chat), a bare
 * file address for a root about that file; `undefined` when the caller has
 * neither in scope. A string applies to every thread in the feed, which is what
 * an issue page has — every root there is about the issue. The project page has
 * both kinds in one feed and passes a function.
 */
export type StreamOf = string | undefined | ((thread: FeedThread) => string | undefined)

/** The later of two markers, either of which may be absent. */
function later(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

/**
 * The id of the first message in this thread the reader has not seen, or
 * `undefined` when there is nothing new.
 *
 * `streamOf` names the marker the root answers to (see {@link StreamOf}); `me`
 * is the viewer's pubkey.
 */
export function firstUnreadIn(
  thread: FeedThread,
  merged: Readonly<Record<string, number>>,
  streamOf: StreamOf,
  me: string,
): string | undefined {
  const streamContext = typeof streamOf === 'function' ? streamOf(thread) : streamOf
  const stream = streamContext === undefined ? undefined : merged[streamContext]
  const ownThread = merged[`thread:${thread.root.id}`]
  // §11.3 — the stream's frontier propagates down to its threads. Only the
  // stream's: a file's roots never answer to the channel's marker, which is the
  // one place the hierarchy stops and the reason a file has a marker at all.
  const forReplies = later(ownThread, stream)

  const isNew = (m: FeedMessage, mark: number | undefined) =>
    mark !== undefined && m.at > mark && m.by !== me

  // A root is a top-level message in its stream, so it answers to the stream's
  // marker — not to its own thread marker, which governs the replies beneath it.
  if (isNew(thread.root, stream)) return thread.root.id
  for (const reply of thread.replies) {
    if (isNew(reply, forReplies)) return reply.id
  }
  return undefined
}

/**
 * `firstUnreadIn` across a feed, as the map the renderer wants.
 *
 * Threads with nothing new are omitted rather than mapped to `undefined`, so a
 * caller can ask `Object.keys(...).length` for "is anything new here" without
 * filtering.
 */
export function firstUnreadByThread(
  threads: readonly FeedThread[],
  merged: Readonly<Record<string, number>>,
  streamOf: StreamOf,
  me: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const thread of threads) {
    const id = firstUnreadIn(thread, merged, streamOf, me)
    if (id) out[thread.id] = id
  }
  return out
}
