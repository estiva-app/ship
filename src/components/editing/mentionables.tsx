import { createContext, useContext } from 'react'
import { decodeNpub, findNostrUris } from '@estiva-app/protocol'
import { Avatar } from '@estiva-app/ui'
import type { MentionPerson } from '@estiva-app/ui/editor'
import type { People } from '@estiva-app/interop'
import type { DirectoryView } from '@/api/useDirectory'

/**
 * What Ship's `@` and `!@` offer — CON-25 — and how `[` captions a message
 * (`snippetOf`); `[`'s sections are `@/api/references` (PEE-21). Kept apart from the triggers
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
 * body is written with. Only those with a profile, as Peek's `mentionablePeopleOf`:
 * the roster also lists keys that are not people (an app's manifest key), and a
 * shortened key is nobody a person can pick.
 */
export function mentionPeople(pubkeys: readonly string[], directory: Pick<DirectoryView, 'nameOf' | 'personOf' | 'profileOf'>): MentionPerson[] {
  return pubkeys
    // A profile with no name is still a shortened key on screen; Peek drops it too.
    .filter((pubkey) => directory.profileOf(pubkey)?.name !== undefined)
    .map((pubkey) => {
      const name = directory.nameOf(pubkey)
      return { id: pubkey, name, pubkey, avatar: <Avatar size={32} src={directory.personOf(pubkey).picture} name={name} /> }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A message's opening words as a caption: marks stripped, a person by name, any other pointer dropped. */
export function snippetOf(body: string, nameOf?: (pubkey: string) => string): string {
  // The URIs are found case-insensitively and returned lowercased, so they are replaced the same way.
  const text = body.replace(/nostr:[a-z0-9]+/gi, (uri) => {
    const found = findNostrUris(uri)[0]
    if (!found?.startsWith('nostr:npub1')) return found ? '' : uri
    try {
      return `@${nameOf?.(decodeNpub(found.slice('nostr:'.length))) ?? 'someone'}`
    } catch {
      return '' // A malformed key is prose, and not worth a caption.
    }
  })
  // Marker text's line prefixes (`#`, `>`, `-`, `1.`), not every leading digit.
  return text.replace(/\*\*|__|[*`]/g, '').replace(/^\s*(?:#{1,6}|>|[-*]|\d+\.)\s+/gm, '').replace(/\s+/g, ' ').trim()
}
