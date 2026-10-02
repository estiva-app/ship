import type { Conversation } from '../nostr/fold'
import type { AnchorIndex } from '../nostr/references'

/** What `ownConversations` needs to know about a project. */
export interface ConversationHome {
  /** The project's address — what its own comments name as their root scope. */
  addr: string
  /** The record channel — `recordChannel(project.contentFolder, teams)`, or `''` when it has none. */
  recordFolder: string
}

/**
 * A project's record channel — the one Folder whose chat is the project's
 * even where it names nothing — or `undefined` when it has none.
 *
 * Its `contentFolder`, unless that is a team. A project created since FOL-2
 * names its team there: it has no channel of its own, and the team's chat is
 * the team's, so neither drawing it nor marking it read belongs on the page.
 * Until the teams are read that cannot be told, and it is `undefined` — a
 * legacy project's unanchored chat arrives a moment late, rather than a
 * team's appearing on every project filed in it.
 */
export function recordChannel(contentFolder: string | undefined, teams: readonly { id: string }[] | undefined): string | undefined {
  if (!contentFolder || !teams) return undefined
  return teams.some((team) => team.id === contentFolder) ? undefined : contentFolder
}

/**
 * A project's own conversation: the threads whose root is a comment on the
 * project, wherever they were filed — plus the legacy record
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
 * **Read in every Folder the workspace read holds**, because a comment stays
 * under the `h` it was written in; nothing can move it. Until MAN-5 this was
 * the union of the Folders a `folder` change had pointed the project at; that
 * field is no longer read, and the anchor alone says whose a thread is.
 * Measured on production on 2026-10-02: 13 threads anchored at the 24 formerly
 * re-pointed projects sit outside their record Folder, each in a Folder the
 * read already fetches because it holds that project's issues.
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
    if (named.length === 0) return home.recordFolder !== '' && c.root.folder === home.recordFolder
    return named.every((address) => address === home.addr)
  })
}
