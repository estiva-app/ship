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

/** The people as the package's list draws them: a name, a face, and the key the body is written with. */
export function mentionPeople(pubkeys: readonly string[], directory: DirectoryView): MentionPerson[] {
  return pubkeys
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
  let text = body
  for (const uri of findNostrUris(body)) {
    let name = ''
    if (uri.startsWith('nostr:npub1')) {
      try {
        name = `@${nameOf?.(decodeNpub(uri.slice('nostr:'.length))) ?? 'someone'}`
      } catch {
        // A malformed key is prose.
      }
    }
    text = text.split(uri).join(name)
  }
  return text.replace(/\*\*|__|[*`]/g, '').replace(/^[#>\-\d.\s]+/gm, '').replace(/\s+/g, ' ').trim()
}

/**
 * What `[` offers: the messages on this page, as Peek's offers the ones on
 * screen (RIC-11), with the thread being replied to last so it is inside the
 * list's last six (`filterReferences`). Files, issues and projects come with
 * PEE-21.
 */
export function referenceItems(threads: readonly ThreadData[], current?: string, nameOf?: (pubkey: string) => string): CaptionedItem[] {
  const ordered = current ? [...threads.filter((t) => t.id !== current), ...threads.filter((t) => t.id === current)] : threads
  return ordered.flatMap((thread) => [thread.root, ...thread.replies].filter((message) => EVENT_ID.test(message.id)).map((message) => referenceItem(message, nameOf)))
}

// Only an event can be referenced: a message drawn from anything else has nothing an `nevent` can name.
const EVENT_ID = /^[0-9a-f]{64}$/

function referenceItem(message: MessageData, nameOf?: (pubkey: string) => string): CaptionedItem {
  return {
    id: message.id,
    label: message.author.name ?? 'Someone',
    snippet: snippetOf(message.body, nameOf),
    // The kind rides in the pointer so a reader fetches the manifest and the event together.
    uri: messageReference(message.id, message.kind ?? CHAT_KIND),
    search: message.body,
  }
}
