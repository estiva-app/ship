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
import type { ThreadsWanted, WorkspaceEvents } from '../nostr/store'
import type { Directory } from '../nostr/profiles'
import { naddrToAddr } from '@estiva-app/protocol'

export type { Change, Conversation, FolderState, Issue, Message, Project } from '../nostr/fold'
export type { ThreadsWanted, WorkspaceEvents, WorkspaceState } from '../nostr/store'
export { holdsThreads } from '../nostr/store'
export { foldWorkspace } from '../nostr/store'
export { useMentionsElsewhere } from './mentionsElsewhere'
export type { Directory, Profile } from '../nostr/profiles'
export { initials } from '../nostr/profiles'
export { ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus, progressOf, projectStatus, type VocabEntry } from '../nostr/kinds'
export { conversationsAbout, eventOf } from '../nostr/fold'
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
export { REACTION_HORIZON, REACTION_EMOJI, type Reaction, type Resolution } from '@estiva-app/conversation'
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
  resolveThread,
  reply,
  assignMissingRefs,
  settleClaims,
  setIssueField,
  setMembership,
  setProjectField,
  setProjectDeleted,
  noteProjectText,
  startConversation,
  workFolder,
  type CardEdit,
  type CreateResult,
  type MoveResult,
  type WriteResult,
} from './writes'
export { clockProblem } from './clock'
import { signer, store } from './store'
import { firstLoad } from './foreign'
import { foldThreads, type EditFold, type Reaction, type Resolution, type RootState } from '@estiva-app/conversation'
import type { Imeta, SignedEvent } from '@estiva-app/protocol'


/**
 * Everything the reader can see: projects, issues, their changes, and the
 * conversations of the Folders `threads` names (APP-5) — unfolded, so a later
 * read can replace one Folder's part of it. Fold it with `foldWorkspace`.
 */
export function loadAllEvents(threads: (folder: string) => boolean): Promise<WorkspaceEvents> {
  return store.loadAllEvents(firstLoad('workspace'), threads)
}

/** `previous` with the conversations a screen draws — APP-5, see `Store.readThreads`. */
export function readThreads(previous: WorkspaceEvents, wanted: ThreadsWanted): Promise<WorkspaceEvents> {
  return store.readThreads(previous, wanted)
}

/** The opened project or issue and its own Folder, before the whole workspace — APP-4, see `Store.loadOpened`. */
export function loadOpened(opened: { kind: 'project' | 'issue'; d: string }): Promise<WorkspaceEvents> {
  return store.loadOpened(opened)
}

/** Re-read only `folders`, keeping the rest of `previous` — PER-17, see `Store.reloadFolders`. */
export function reloadFolders(previous: WorkspaceEvents, folders: string[]): Promise<WorkspaceEvents> {
  return store.reloadFolders(previous, folders)
}

/** A thread of a page, as `threadsOn` reads it: its messages' events, and whether its comment was not in the read. */
export interface ThreadToRead {
  id: string
  /** Its messages, the comment first when it is there: their ids and `created_at`, and the events themselves. */
  messages: readonly { id: string; at: number; event?: SignedEvent }[]
  /** Its comment was not in the workspace read (`Conversation.rootMissing`). */
  gone: boolean
}

/**
 * A page's threads, folded by the one shared fold (`foldThreads`, SPEC
 * §6.4–§6.6, ONE-9) with what is read about them by target — CON-2, PEEK-128.
 *
 * Addressed by target because a `kind:7` carries no `h` (SPEC §6.6), through
 * the package's `decorationsOf`: the newest 100 targets by `created_at`, one
 * per `(target, pubkey, emoji)`, and both cuts reported. Reactions come keyed
 * by person, as Peek and Leaf count them; sorted most reacted first here,
 * which §6.6 leaves to the app.
 *
 * The same read brings each thread's resolutions (`kind:9101`): the one that
 * counts by §6.4 is the thread's state, whoever wrote it, also under a comment
 * that is gone. Ship writes them too since ONE-8 (`resolveThread`). And a thread whose
 * comment was not returned asks for its `kind:5`: deleted by its author, or
 * `missing`, one this reader cannot read (§6.5).
 */
export async function threadsOn(threads: readonly ThreadToRead[]): Promise<{
  reactions: ReactionsByTarget
  /** Targets past the horizon, not asked about. */
  omitted: number
  /** Whether the relay may hold reactions this read did not bring back. */
  cut: boolean
  /** By thread id, the resolution of each thread that stands resolved; a reopened one is absent. */
  resolved: Record<string, Resolution>
  /** By thread id, each thread whose comment is gone: deleted by its author, or not readable here. */
  gone: Record<string, Exclude<RootState, 'present'>>
}> {
  // A gone comment is a target too, for its thread's resolution: dated by its earliest reply.
  const goneIds = threads.filter((thread) => thread.gone).map((thread) => thread.id)
  const targets = [
    ...threads.flatMap((thread) => thread.messages.map(({ id, at }) => ({ id, at }))),
    ...threads.filter((thread) => thread.gone).map((thread) => ({ id: thread.id, at: thread.messages[0]?.at ?? 0 })),
  ]
  const { decorations, events, deletionsRead } = await store.threadEvents(targets, goneIds)
  const folded = foldThreads([...threads.flatMap((thread) => thread.messages.flatMap((m) => m.event ?? [])), ...events], { viewer: signer.pubkey })
  const reactions: ReactionsByTarget = {}
  const resolved: Record<string, Resolution> = {}
  const gone: Record<string, Exclude<RootState, 'present'>> = {}
  for (const thread of folded) {
    for (const message of [...(thread.root ? [thread.root] : []), ...thread.replies]) {
      if (message.reactions.length) reactions[message.id] = [...message.reactions].sort((a, b) => b.count - a.count)
    }
    if (thread.resolution?.action === 'resolved') resolved[thread.id] = thread.resolution
    // With the deletion read failed, "missing" is unproven: leave it out, and the thread keeps reading as deleted.
    if (thread.state === 'deleted' || (thread.state === 'missing' && deletionsRead)) gone[thread.id] = thread.state
  }
  return { reactions, omitted: decorations.reactionTargetsOmitted, cut: decorations.reactionEventsCut, resolved, gone }
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
