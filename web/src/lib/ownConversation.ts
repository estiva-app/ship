import type { Conversation } from '../../../src/fold'
import type { TaggedIndex } from '../../../src/references'

/**
 * A project's own conversation, now that other files live in its Folder —
 * RFC 0.5 §10.7: a different file is a different conversation.
 *
 * A project *is* its Folder, so a message written there that names no object
 * is the project's — identity merges, and that is why the filter has always
 * been the Folder and not the project's `a` tag (CON-9, and the note above
 * `conversations` in `ProjectPage`). What changed is what else lives in the
 * Folder. A bare-file topic somebody started under the project is a file of
 * its own with a discussion of its own, and its `kind:1111`s are rooted at the
 * topic's address, not the project's. Drawing them under the project's
 * *Conversations* would show one file's talk on another file's page; the topic
 * reaches the page as a Related card with a count instead, and a person opens
 * it where it lives.
 *
 * The root's tags decide, as everywhere in `references.ts`: a thread whose
 * root names an address other than this project's is that object's discussion
 * — a topic's, an issue's (the ones Activity already rolls up), or an issue's
 * that was since moved to another project and left its conversation behind.
 * A thread whose root names nothing, or names the project, is the project's.
 *
 * Measured on production before the change (2026-09-12): of 599 threads in
 * project Folders, 560 are rooted at another file; 539 of those were already
 * rolled up as issue comments, and the 21 this newly drops are two topic
 * threads and nineteen comments on issues moved out of the project — each of
 * which the issue's own page still shows.
 */
export function ownConversations(conversations: readonly Conversation[], folder: string, address: string, tagged: TaggedIndex): Conversation[] {
  return conversations.filter((c) => c.root.folder === folder && !aboutAnotherFile(c, address, tagged))
}

function aboutAnotherFile(c: Conversation, address: string, tagged: TaggedIndex): boolean {
  return (tagged[c.root.id] ?? []).some((named) => named !== address)
}
