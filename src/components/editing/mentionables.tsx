import { createContext, useContext } from 'react'
import { mentionablePeople } from '@estiva-app/conversation'
import { Avatar } from '@estiva-app/ui'
import type { MentionPerson } from '@estiva-app/ui/editor'
import type { People } from '@estiva-app/interop'
import type { DirectoryView } from '@/api/useDirectory'

/**
 * What Ship's `@` and `!@` offer — CON-25; `[`'s sections, and how it captions
 * a message, are `@/api/references` (PEE-21). Kept apart from the triggers
 * (`composerTriggers.tsx`) because the page draws these and must not load the
 * editor to do it (RIC-14): only types come from `@estiva-app/ui/editor`.
 */

/** Everyone `@` and `!@` offer: the people in the workspace snapshot, as the Assignee list has them. */
const MentionPeopleContext = createContext<readonly MentionPerson[]>([])
/** Hands every message box on the page the people `@` and `!@` offer. */
export const MentionPeopleProvider = MentionPeopleContext.Provider
export const useMentionPeople = () => useContext(MentionPeopleContext)

const WorkspacePeopleContext = createContext<People | undefined>(undefined)
/** Hands every linked file's card the workspace's people, as interop names them: whom its owner picker offers (WBM-5). */
export const WorkspacePeopleProvider = WorkspacePeopleContext.Provider
export const useWorkspacePeople = () => useContext(WorkspacePeopleContext)

/** Everyone with a profile, by key, for {@link WorkspacePeopleProvider}. */
export function workspacePeople(pubkeys: readonly string[], directory: Pick<DirectoryView, 'profileOf'>): People {
  const out: People = {}
  for (const pubkey of pubkeys) {
    const profile = directory.profileOf(pubkey)
    if (profile) out[pubkey] = { displayName: profile.name, picture: profile.picture }
  }
  return out
}

/**
 * The people as the package's list draws them: a name, a face, and the key the
 * body is written with. `pubkeys` is the roster (or, with none, the snapshot's
 * people); which of them `@` offers, and in what order, is the shared rule
 * Peek and Leaf use too (`mentionablePeople`, PEEKM-6).
 */
export function mentionPeople(pubkeys: readonly string[], me: string, directory: Pick<DirectoryView, 'nameOf' | 'personOf' | 'profileOf'>): MentionPerson[] {
  // A profile with no name is still a shortened key on screen, and nobody a person can pick.
  const named = pubkeys.flatMap((pubkey) => (directory.profileOf(pubkey)?.name !== undefined ? [{ pubkey, name: directory.nameOf(pubkey) }] : []))
  return mentionablePeople(named, null, me).map(({ pubkey, name }) => ({
    id: pubkey,
    name,
    pubkey,
    avatar: <Avatar size={32} src={directory.personOf(pubkey).picture} name={name} />,
  }))
}
