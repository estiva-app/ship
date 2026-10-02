import { createContext, useContext } from 'react'
import { decodeNpub, findNostrUris } from '@estiva-app/protocol'
import { messageReference } from '@estiva-app/conversation'
import { Avatar } from '@estiva-app/ui'
import type { CaptionedItem, MentionPerson } from '@estiva-app/ui/editor'
import type { DirectoryView } from '@/api/useDirectory'
import type { MessageData, ThreadData } from '@/components/ConversationThread'

/**
 * What Ship's `@`, `!@` and `[` offer — CON-25. Kept apart from the triggers
 * (`composerTriggers.tsx`) because the page draws these and must not load the
 * editor to do it (RIC-14): only types come from `@estiva-app/ui/editor`.
 */

/** Everyone `@` and `!@` offer: the people in the workspace snapshot, as the Assignee list has them. */
const MentionPeopleContext = createContext<readonly MentionPerson[]>([])
export const MentionPeopleProvider = MentionPeopleContext.Provider
export const useMentionPeople = () => useContext(MentionPeopleContext)

/**
 * The people as the package's list draws them: a name, a face, and the key the
 * body is written with. Only those with a profile, as Peek's `mentionablePeopleOf`:
 * the roster also lists keys that are not people (an app's manifest key), and a
 * shortened key is nobody a person can pick.
 */
export function mentionPeople(pubkeys: readonly string[], directory: Pick<DirectoryView, 'nameOf' | 'personOf' | 'profileOf'>): MentionPerson[] {
  return pubkeys
    .filter((pubkey) => directory.profileOf(pubkey) !== undefined)
    .map((pubkey) => {
      const name = directory.nameOf(pubkey)
      return { id: pubkey, name, pubkey, avatar: <Avatar size={32} src={directory.personOf(pubkey).picture} name={name} /> }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// A message drawn without its kind is taken as chat: the kind is a hint, and a wrong one costs a reader a fetch.
const CHAT_KIND = 9

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

/**
 * What `[` offers: the messages on this page, oldest first as Peek's list of
 * the ones on screen is (RIC-11), with the thread being replied to last — the
 * package keeps the list's last six (`filterReferences`), so these are the
 * newest. The page draws threads newest first, which is why they are re-sorted.
 * Files, issues and projects come with PEE-21.
 */
export function referenceItems(threads: readonly ThreadData[], current?: string, nameOf?: (pubkey: string) => string): CaptionedItem[] {
  const messages = (list: readonly ThreadData[]) =>
    list
      .flatMap((thread) => [thread.root, ...thread.replies])
      .filter((message) => EVENT_ID.test(message.id))
      .sort((a, b) => a.at - b.at)
  const ordered = current ? [...messages(threads.filter((t) => t.id !== current)), ...messages(threads.filter((t) => t.id === current))] : messages(threads)
  return ordered.map((message) => referenceItem(message, nameOf))
}

// Only an event can be referenced: a message drawn from anything else has nothing an `nevent` can name.
const EVENT_ID = /^[0-9a-f]{64}$/

// `[` asks on every keystroke, for every message on the page; a message's item never changes, so each is built once.
const ITEMS = new WeakMap<MessageData, CaptionedItem>()

function referenceItem(message: MessageData, nameOf?: (pubkey: string) => string): CaptionedItem {
  const known = ITEMS.get(message)
  if (known) return known
  const item = {
    id: message.id,
    label: message.author.name ?? 'Someone',
    snippet: snippetOf(message.body, nameOf),
    // The kind rides in the pointer so a reader fetches the manifest and the event together.
    uri: messageReference(message.id, message.kind ?? CHAT_KIND),
    search: message.body,
  }
  ITEMS.set(message, item)
  return item
}
