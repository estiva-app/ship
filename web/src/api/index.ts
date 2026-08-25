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
import { Relay } from '../../../lib/nostr/relay'
import { localSigner, type Signer } from '../../../lib/nostr/signer'
import { Store } from '../../../src/store'
import type { FolderState } from '../../../src/fold'
import type { Directory } from '../../../src/profiles'
import { RELAY_URL } from '../config'

export type { Change, Conversation, FolderState, Issue, Message, Project } from '../../../src/fold'
export type { Directory, Profile } from '../../../src/profiles'
export { initials } from '../../../src/profiles'
export { ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus, type VocabEntry } from '../../../src/kinds'
export { useWorkspace } from './useWorkspace'

/**
 * Who signs, decided once.
 *
 * Anonymous: a throwaway per-browser key, exactly as the old app does when
 * nobody is signed in — the relay wants a signature on every request even to
 * read, and an anonymous reader is a real mode, not a degraded one. Sign-in
 * through Estiva ID replaces this signer in REW-2; `Store` cannot tell the
 * difference, which is the point of the signer seam.
 */
const signer: Signer = localSigner('ship.secretkey')

const store = new Store(new Relay(RELAY_URL, signer), signer)

/** Everything the reader can see: projects, issues, their changes and threads. */
export function loadAll(): Promise<FolderState> {
  return store.loadAll()
}

/** kind:0 profiles for a set of pubkeys — names and faces, never keys. */
export function profiles(pubkeys: string[]): Promise<Directory> {
  return store.profiles(pubkeys)
}
