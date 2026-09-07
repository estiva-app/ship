/**
 * The data seam.
 *
 * Everything the UI knows about the workspace comes through here, and this is
 * the ONLY module allowed to import from ../../../src and ../../../lib. Those
 * directories are Ship's data layer — the fold, the store, the wire format —
 * and they are vendored by copy into estiva-agent at identical paths, so they
 * are never edited from the UI. If a screen needs the data shaped differently,
 * the adapter goes here, not there.
 *
 * Components import from '@/api'. A component importing '../../src/...' is a
 * boundary violation, whatever it does.
 */
import type { WorkspaceState } from '../../../src/store'
import type { Directory } from '../../../src/profiles'
import { addrToNaddr, naddrToAddr } from '@estiva-app/protocol'
import { folderLink, parseFolderLink } from '../../../src/events'
import { RELAY_URL } from '../config'

export type { Change, Conversation, FolderState, Issue, Message, Project } from '../../../src/fold'
export type { WorkspaceState } from '../../../src/store'
export type { Directory, Profile } from '../../../src/profiles'
export { initials } from '../../../src/profiles'
export { ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus, type VocabEntry } from '../../../src/kinds'
export { conversationsAbout } from '../../../src/fold'
/*
  The two lists, and the rule that separates them — SPEC §6.4, CON-7.

  `conversationsAbout` is the *union* and stays exported, because "everything
  attached to this object" is still the right question for a count of activity.
  It is the wrong question for a comment feed: it merges a thread that declared
  itself to be about the object with one that named it in passing, and the
  second attaches permanently and by accident.
*/
export { commentsOn, commentsOnAny, mentionsOf, attachmentOf, type Attachment, type TaggedIndex } from '../../../src/references'
export { foldEdits, type Edit, type EditIndex } from '../../../src/edits'
/* Reactions — SPEC §6.6. The horizon and the fold are in the data layer, where
   they can move into the conversation package; the hook that calls them is the
   app's. */
export { REACTION_TARGET_LIMIT, REACTION_EMOJI, type Reaction, type ReactionsByTarget } from '../../../src/reactions'
export { useReactions } from './useReactions'
export { useWorkspace } from './useWorkspace'
export { useDirectory, type DirectoryView, type Person } from './useDirectory'
export { peopleIn, short } from './people'
/* Read state on the relay (CRO-8). The context grammar is exported so a page
   builds ids through it rather than inventing one — the mapping is the part the
   ticket says to get right, and a wrong id is permanent in a grow-only blob. */
export { projectContext, threadContext, messageContext } from './readState'
export { markRead, flushReadState, installReadStateFlush, useMergedReadState, READ_DWELL_MS } from './readStateSync'
import { installReadStateDiagnostic } from './readStateSync'
/* `window.__readState()` — see readStateSync.ts. Installed at module scope so it
   is there before anything asks, including on a page loaded straight from a URL. */
installReadStateDiagnostic()
export { firstUnreadByThread } from './unreadFeed'
export {
  archiveProject,
  createIssue,
  createProject,
  deleteIssue,
  deleteMessage,
  editMessage,
  deleteProject,
  explainRejection,
  pairProjectFolder,
  react,
  unreact,
  reply,
  assignMissingRefs,
  setIssueField,
  setProjectField,
  startConversation,
  type CreateResult,
  type WriteResult,
} from './writes'
export { clockProblem } from './clock'
import { signer, store } from './store'
import { foldReactions } from '../../../src/reactions'
import type { ReactionsByTarget } from '../../../src/reactions'


/** Everything the reader can see: projects, issues, their changes and threads. */
export function loadAll(): Promise<WorkspaceState> {
  return store.loadAll()
}

/**
 * Reactions on a set of messages, folded into counts — CON-2.
 *
 * Addressed by target because a `kind:7` carries no `h` (SPEC §6.6). The
 * viewer is passed here rather than read inside the fold, so the fold stays
 * pure and testable with no app around it.
 */
export function reactionsOn(eventIds: string[]): Promise<ReactionsByTarget> {
  return store.reactionsFor(eventIds).then((events) => foldReactions(events, signer.pubkey))
}

/** kind:0 profiles for a set of pubkeys — names and faces, never keys. */
export function profiles(pubkeys: string[]): Promise<Directory> {
  return store.profiles(pubkeys)
}

/** The viewer's own key — what "assigned to me" and "you" mean. */
export const me: string = signer.pubkey

/**
 * A `nostr:naddr…` reference for an object, carrying this relay as its hint —
 * what "Copy reference for Peek" puts on the clipboard.
 */
export function referenceFor(addr: string): string {
  return `nostr:${addrToNaddr(addr, [RELAY_URL])}`
}

/** A `folder:<uuid>` link, the handle pasted into Peek to pair a topic — and the parser for one somebody pasted here. */
export { folderLink, parseFolderLink }

/**
 * Land an inbound `#/o/<naddr>` on the right surface. Resolves the pointer
 * against the relay — the only way to learn which Folder it is in, and the
 * honest access check — and returns the address and kind, or `null` when the
 * object is unreadable from here. A malformed pointer throws.
 */
export async function resolveInbound(naddr: string): Promise<{ addr: string; kind: 'project' | 'issue' } | null> {
  const addr = naddrToAddr(naddr)
  const found = await store.resolveObject(addr)
  if (!found) return null
  return { addr, kind: addr.startsWith('30850:') ? 'project' : 'issue' }
}
