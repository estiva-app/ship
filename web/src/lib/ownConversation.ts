import type { Conversation } from '../../../src/fold'
import type { AnchorIndex } from '../../../src/references'

/** What `ownConversations` needs to know about a project. */
export interface ConversationHome {
  /** The project's address — what its own comments name as their root scope. */
  addr: string
  /** The record channel: the Folder the project was created with (`projectFolders`' first entry). */
  originFolder: string
  /** Every Folder the project has pointed at — `projectFolders(project, activity)`. */
  folders: readonly string[]
}

/**
 * A project's own conversation: the threads whose root is a comment on the
 * project, wherever in its Folders they were filed — plus the legacy record
 * channel's talk that names nothing (FOL-1).
 *
 * **The anchor decides, not the Folder.** It used to be the other way round: a
 * project *was* its Folder, so any message written there that named no object
 * was the project's (CON-9). That stopped being true when a project could
 * point at its team's Folder. A team Folder holds every project in the team,
 * their issues and topics, and whatever anybody says to the team; reading "the
 * Folder's talk" there would put the team's chat on every project page in it.
 * So a thread is the project's when its root names the project — for a
 * `kind:1111` that is its `A` tag, the §6.4 per-tag rule `anchorIndex` already
 * applies — and names nothing else.
 *
 * **Read across every Folder the project has had**, because a relinked
 * project's comments stay under the `h` they were written in; nothing can move
 * them. Measured on production before the change (2026-09-24): of the eleven
 * projects pointing at a team, the pages showed 2 threads between them, while
 * 36 threads anchored at those projects sat in their earlier Folders.
 *
 * **The "names nothing" rule survives for the record channel only.** That
 * Folder was the project's alone, so its bare chat really is the project's —
 * 21 such threads on production at the time, 16 of them Peek: Feedback & Bugs'.
 * It is never applied to any other Folder, which is what keeps team chat off.
 *
 * The root's tags decide, as everywhere in `references.ts`: a reply naming
 * something, or a body mention, does not move a thread. A thread whose root
 * names another file — a topic's, an issue's — is that file's discussion and
 * stays off the page (RFC 0.5 §10.7).
 */
export function ownConversations(conversations: readonly Conversation[], home: ConversationHome, anchors: AnchorIndex): Conversation[] {
  return conversations.filter((c) => {
    const named = anchors[c.root.id] ?? []
    // A record with no Folder has no record channel; `''` must not match a root that carried no `h`.
    if (named.length === 0) return home.originFolder !== '' && c.root.folder === home.originFolder
    return home.folders.includes(c.root.folder) && named.every((address) => address === home.addr)
  })
}
