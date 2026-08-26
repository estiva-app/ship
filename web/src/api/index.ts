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
import type { FolderState } from '../../../src/fold'
import type { Directory } from '../../../src/profiles'
import { addrToNaddr, naddrToAddr } from '../../../lib/nostr/nip19'
import { folderLink, parseFolderLink } from '../../../src/events'
import { RELAY_URL } from '../config'

export type { Change, Conversation, FolderState, Issue, Message, Project } from '../../../src/fold'
export type { Directory, Profile } from '../../../src/profiles'
export { initials } from '../../../src/profiles'
export { ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus, type VocabEntry } from '../../../src/kinds'
export { conversationsAbout } from '../../../src/fold'
export { useWorkspace } from './useWorkspace'
export { useDirectory, type DirectoryView, type Person } from './useDirectory'
export { peopleIn, short } from './people'
export {
  archiveProject,
  createIssue,
  createProject,
  deleteProject,
  explainRejection,
  pairProjectFolder,
  reply,
  setIssueField,
  setProjectField,
  startConversation,
  type CreateResult,
  type WriteResult,
} from './writes'
export { clockProblem } from './clock'
import { signer, store } from './store'


/** Everything the reader can see: projects, issues, their changes and threads. */
export function loadAll(): Promise<FolderState> {
  return store.loadAll()
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
