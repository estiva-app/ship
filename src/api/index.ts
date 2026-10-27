/**
 * The data seam.
 *
 * Everything the UI knows about the workspace comes through here, and this is
 * the ONLY module allowed to import from ../nostr. That directory is Ship's
 * data layer — the fold, the store, the wire format — and it is vendored by
 * copy into estiva-agent, so it is never edited from the UI. If a screen needs
 * the data shaped differently, the adapter goes here, not there.
 *
 * Components import from '@/api'. A component importing '@/nostr/...' is a
 * boundary violation, whatever it does.
 */
import type { WorkspaceEvents } from '../nostr/store'
import type { Directory } from '../nostr/profiles'
import { naddrToAddr } from '@estiva-app/protocol'

export type { Change, Conversation, FolderState, Issue, Message, Project } from '../nostr/fold'
export type { WorkspaceEvents, WorkspaceState } from '../nostr/store'
export { foldWorkspace } from '../nostr/store'
export type { Directory, Profile } from '../nostr/profiles'
export { initials } from '../nostr/profiles'
export { ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus, type VocabEntry } from '../nostr/kinds'
export { conversationsAbout } from '../nostr/fold'
export { keyProblem, projectKeys, suggestKey, takenKeys } from '../nostr/keys'
/*
  The two lists, and the rule that separates them — SPEC §6.4, CON-7.

  `conversationsAbout` is the *union* and stays exported, because "everything
  attached to this object" is still the right question for a count of activity.
  It is the wrong question for a comment feed: it merges a thread that declared
  itself to be about the object with one that named it in passing, and the
  second attaches permanently and by accident.
*/
export { commentsOn, commentsOnAny, attachmentOf, type Attachment, type AnchorIndex } from '../nostr/references'
/* Edits, attachments and reactions — SPEC §6.6, §6.8. The folds and the
   horizon are `@estiva-app/conversation`'s (CON-5); the hook that calls them
   is the app's. */
export type EditIndex = Record<string, EditFold>
export type AttachmentIndex = Record<string, Imeta[]>
/** Target event id → its reactions, most reacted first. */
export type ReactionsByTarget = Record<string, Reaction[]>
export { REACTION_HORIZON, REACTION_EMOJI, type Reaction } from '@estiva-app/conversation'
export { useReactions } from './useReactions'
export { useWorkspace } from './useWorkspace'
export { useDirectory, type DirectoryView, type Person } from './useDirectory'
export { peopleIn, short } from './people'
/* Read state on the relay (CRO-8). The context grammar is exported so a page
   builds ids through it rather than inventing one — the mapping is the part the
   ticket says to get right, and a wrong id is permanent in a grow-only blob.
   They are `@estiva-app/conversation`'s, as Peek's are (CON-19). */
export { channelContext, fileContext, threadContext, messageContext } from '@estiva-app/conversation'
export { markRead, flushReadState, installReadStateFlush, useMergedReadState, useOpeningReadState, READ_DWELL_MS } from './readStateSync'
import { installReadStateDiagnostic } from './readStateSync'
/* `window.__readState()` — see readStateSync.ts. Installed at module scope so it
   is there before anything asks, including on a page loaded straight from a URL. */
installReadStateDiagnostic()
export { unreadByThread } from './unreadFeed'
export { useFeedJudges, type FeedFile } from './useFeedJudges'
export {
  addMentioned,
  archiveProject,
  archiveIssue,
  archiveFolder,
  createIssue,
  createProject,
  deleteIssue,
  deleteMessage,
  editMessage,
  deleteProject,
  moveProject,
  createFolder,
  renameFolder,
  react,
  unreact,
  reply,
  assignMissingRefs,
  settleClaims,
  setIssueField,
  setMembership,
  setProjectField,
  startConversation,
  workFolder,
  type CardEdit,
  type CreateResult,
  type WriteResult,
} from './writes'
export { clockProblem } from './clock'
import { signer, store } from './store'
import { groupReactions, type EditFold, type Reaction } from '@estiva-app/conversation'
import type { Imeta } from '@estiva-app/protocol'


/**
 * Everything the reader can see: projects, issues, their changes and threads —
 * unfolded, so a later read can replace one Folder's part of it. Fold it with
 * `foldWorkspace`.
 */
export function loadAllEvents(): Promise<WorkspaceEvents> {
  return store.loadAllEvents()
}

/** Re-read only `folders`, keeping the rest of `previous` — PER-17, see `Store.reloadFolders`. */
export function reloadFolders(previous: WorkspaceEvents, folders: string[]): Promise<WorkspaceEvents> {
  return store.reloadFolders(previous, folders)
}

/**
 * Reactions on a set of messages, folded into counts — CON-2.
 *
 * Addressed by target because a `kind:7` carries no `h` (SPEC §6.6), through
 * the package's `decorationsOf`: the newest 100 targets by `created_at`, one
 * per `(target, pubkey, emoji)`, and both cuts reported. Sorted most reacted
 * first here, which §6.6 leaves to the app.
 */
export async function reactionsOn(targets: readonly { id: string; at: number }[]): Promise<{
  reactions: ReactionsByTarget
  /** Targets past the horizon, not asked about. */
  omitted: number
  /** Whether the relay may hold reactions this read did not bring back. */
  cut: boolean
}> {
  const decorations = await store.decorationsFor(targets)
  const reactions = groupReactions(
    Object.values(decorations.byId).flatMap((d) => d.reactions),
    signer.pubkey,
  )
  for (const list of Object.values(reactions)) list.sort((a, b) => b.count - a.count)
  return { reactions, omitted: decorations.reactionTargetsOmitted, cut: decorations.reactionEventsCut }
}

/** kind:0 profiles for a set of pubkeys — names and faces, never keys. */
export function profiles(pubkeys: string[]): Promise<Directory> {
  return store.profiles(pubkeys)
}

/** The viewer's own key — what "assigned to me" and "you" mean. */
export const me: string = signer.pubkey

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
