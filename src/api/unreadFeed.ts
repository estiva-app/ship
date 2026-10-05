/**
 * Where "new since you looked" goes in a conversation (CRO-13, CON-19).
 *
 * Ship publishes and merges NIP-RS read state and draws the smallest surface
 * that makes the cross-app claim observable: **a divider inside the comment feed
 * on an issue or a project — no dots in lists, nothing in the sidebar.** An
 * issue list is dense, an issue is not a container, and inside the feed the
 * question "unread *of what*" does not arise: the divider sits above the first
 * message you have not seen. SPEC §11.8 says an app lights nothing for a stream
 * it has no screen for, so there is nothing to judge outside these two feeds.
 *
 * ## What is unread is the package's call
 *
 * Which messages are unread — §11.8's four conditions against §11.3's effective
 * marker — is `unreadIn` in `@estiva-app/conversation`, the same function Peek
 * asks. This file only hands it Ship's messages and says, per thread, which
 * stream it answers to and who is judging. In short:
 *
 * - **Membership is the gate.** A message is unread to a member of the stream's
 *   file, never to somebody who merely can read it, and a muted stream lights
 *   only for a message that names you.
 * - **A file with no marker counts from when you joined.** A message is unread
 *   from the second you became a member, so a file you were placed on lights
 *   from the placement, and Ship's years of history do not all arrive as new on
 *   the first run.
 * - A root answers to its stream's marker; a reply to the later of its thread's
 *   marker and its stream's (§11.3). The channel's marker never reaches into a
 *   file's stream: reading the project page says nothing about its issues.
 *
 * Applied at read time and never written down — the blob is grow-only.
 */
import { unreadIn, type StreamJudge } from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'
import type { Conversation, Message } from '../nostr/fold'
import { KIND } from '../nostr/kinds'

type Judgable = Pick<SignedEvent, 'id' | 'pubkey' | 'kind' | 'created_at' | 'tags' | 'content'>

/**
 * A fold message as the package judges one: its id, author, second and text,
 * and the one `e` tag that says which thread it is in. Judging reads nothing
 * else, so nothing else is invented.
 */
function judgable(message: Message): Judgable {
  const tags: string[][] =
    message.rootId === undefined
      ? []
      : [
          ['e', message.rootId, '', 'root'],
          ['e', message.parentId ?? message.rootId, '', 'reply'],
        ]
  return {
    id: message.id,
    pubkey: message.author,
    kind: KIND.MESSAGE,
    created_at: message.createdAt,
    tags,
    content: message.body,
  }
}

/**
 * The unread messages of each thread, oldest first, as the map the renderer
 * wants: the divider goes above the first, and a thread's "N new" is how many
 * of its replies are in the list. The list is the package's verdict, not a
 * position — counting every reply after the first unread one counted your own
 * replies as new, and none at all when the root was the first (SHI-38).
 *
 * `judgeOf` names the stream a thread answers to and who is judging it
 * (see {@link StreamJudge}); `undefined` lights nothing for that thread, which
 * is how a feed says "I have no verdict yet" — a membership still loading must
 * read as quiet rather than flash a divider onto every thread and take it away.
 * Threads that share a judge object are judged together.
 *
 * Threads with nothing new are omitted rather than mapped to `undefined`, so a
 * caller can ask `Object.keys(...).length` for "is anything new here".
 */
export function unreadByThread(
  conversations: readonly Conversation[],
  merged: Readonly<Record<string, number>>,
  judgeOf: (conversation: Conversation) => StreamJudge | undefined,
): Record<string, string[]> {
  const byJudge = new Map<StreamJudge, Judgable[]>()
  const threadOf = new Map<string, string>()
  for (const conversation of conversations) {
    const judge = judgeOf(conversation)
    if (!judge) continue
    const events = byJudge.get(judge) ?? []
    for (const message of [conversation.root, ...conversation.replies]) {
      events.push(judgable(message))
      threadOf.set(message.id, conversation.id)
    }
    byJudge.set(judge, events)
  }

  const out: Record<string, string[]> = {}
  for (const [judge, events] of byJudge) {
    // `unreadIn` answers oldest first within a thread, so each list's first
    // id is the message the divider goes above.
    for (const message of unreadIn(events, merged, judge)) {
      const thread = threadOf.get(message.id)
      if (thread !== undefined) (out[thread] ??= []).push(message.id)
    }
  }
  return out
}
