/**
 * What `[` offers in Ship (PEE-21): Files, then Messages (Katerina, 30 Oct,
 * widget review 19), ranked by `@estiva-app/conversation`'s `rankReferences`
 * and drawn in `referenceSectionsOf`'s order, as Peek and Leaf draw them. A
 * message's row is the package's (`messageCandidate`): found by its own words,
 * never by the raw text of a link in it, and an app link Ship has an answer
 * for read as what it names.
 *
 * - **Messages:** where the box is — a thread's reply box offers that thread,
 *   then the rest of the page; the page's own box offers the page, then its
 *   parent's (an issue's project, Miky 2026-10-03). See {@link messageScope}.
 * - **Files:** this Folder's — the listing the Related section already reads —
 *   then the files you read recently (your read markers), then, once you type,
 *   relay search. The page you are on is never offered.
 *
 * The editor asks synchronously on every keystroke, so the tiers are held here
 * and kept fresh by the page ({@link useReferencePage}); a search or tier
 * landing tells the open list to draw again ({@link subscribeReferences}).
 * Ship's signed-in identity is fixed for the page's life (`me`), so nothing
 * here can be answered for one person and shown to another.
 */
import { useEffect } from 'react'
import {
  FILE_TIER,
  MESSAGE_TIER,
  messageCandidate as messageRow,
  openingWords,
  rankReferences,
  referenceSearch,
  referenceSectionsOf,
  type ReferenceCandidate,
} from '@estiva-app/conversation'
import { decodeNevent } from '@estiva-app/protocol'
import type { CaptionedItem, ReferenceTriggerOptions } from '@estiva-app/ui/editor'
import type { MessageData, ThreadData } from '@/components/ConversationThread'
import { KIND } from '@/nostr/kinds'
import { fileCandidatesOf, searchFiles, type ForeignObject } from './foreign'
import { knownLinkValue, links, linksChanged } from './linkCards'
import { short } from './people'

/**
 * A person's name for the package's captions. Ship's `nameOf` answers a key it
 * cannot name with its own short form; the caption says such a person as
 * §13.1's shortened `npub`, as Peek and Leaf do (PEEKM-6).
 */
const named = (nameOf?: (pubkey: string) => string) => (pubkey: string) => {
  const name = nameOf?.(pubkey)
  return name === short(pubkey) ? undefined : name
}

/** A message's opening words, read as in Peek and Leaf, an app link Ship has an answer for read as what it names (widget review 20). */
function captionOf(body: string, nameOf?: (pubkey: string) => string): string {
  return openingWords(body, named(nameOf), { resolveLink: knownLinkValue })
}

export type ReferenceSection = ReturnType<NonNullable<ReferenceTriggerOptions['sections']>>[number]

/** The section headings; Files are drawn above Messages (`referenceSectionsOf`). */
export const REFERENCE_COPY = { ariaLabel: 'Messages and files', messages: 'Messages', files: 'Files' }

/** How many recently read files are looked up — a few more than the section shows. */
const RECENT_LIMIT = 12
const ADDRESS_RE = /^\d+:[0-9a-f]{64}:.+$/
// A message drawn without its kind is taken as chat: the kind is a hint, and a wrong one costs a reader a fetch.
const CHAT_KIND = 9
const EVENT_ID = /^[0-9a-f]{64}$/

let folderFiles: ReferenceCandidate[] = []
let recentFiles: ReferenceCandidate[] = []
let openFile: string | null = null
let parentThreads: readonly ThreadData[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

const search = referenceSearch({ search: searchFiles })

/** Called while `[`'s list is open; told when a tier, a search answer or a link's answer changes. */
export function subscribeReferences(listener: () => void): () => void {
  listeners.add(listener)
  const unsubscribe = search.subscribe(listener)
  // A link's answer changes how a message's caption reads it.
  const unlink = linksChanged(listener)
  return () => {
    listeners.delete(listener)
    unsubscribe()
    unlink()
  }
}

// `[` asks on every keystroke, for every message in scope; a message's row is built once per tier and per link answers.
const BUILT = new WeakMap<MessageData, { answers: number; row: ReferenceCandidate }>()

function messageCandidate(message: MessageData, tier: number, nameOf?: (pubkey: string) => string): ReferenceCandidate {
  const answers = links.version()
  const known = BUILT.get(message)
  if (known && known.answers === answers) return known.row.tier === tier ? known.row : { ...known.row, tier }
  // The kind rides in the pointer so a reader fetches the manifest and the event together.
  const row = messageRow({ id: message.id, kind: message.kind ?? CHAT_KIND, author: message.author.name ?? 'Someone', body: message.body, at: message.at }, tier, named(nameOf), { resolveLink: knownLinkValue })
  BUILT.set(message, { answers, row })
  return row
}

const messagesOf = (threads: readonly ThreadData[], tier: number, nameOf?: (pubkey: string) => string): ReferenceCandidate[] =>
  threads
    .flatMap((thread) => [thread.root, ...thread.replies])
    .filter((message) => EVENT_ID.test(message.id))
    .map((message) => messageCandidate(message, tier, nameOf))

function itemOf(candidate: ReferenceCandidate): CaptionedItem {
  if (candidate.type === 'message') {
    return { id: candidate.id, label: candidate.title, snippet: candidate.caption, uri: candidate.uri, search: candidate.search }
  }
  // The title alone: the row's icon says what it is (Katerina, 8 October), as in Peek, so "Project:" before it said it twice.
  // A file's summary is the row's second line, and an issue's project moves up beside its title (SUM-7).
  return {
    id: candidate.id,
    label: candidate.title,
    snippet: '',
    uri: candidate.uri,
    description: candidate.caption || undefined,
    summary: candidate.summary,
  }
}

/**
 * Which messages a box offers first. A thread's reply box: that thread, then
 * the rest of the page — as Peek offers a thread, then its file. The page's own
 * box: the page, then its parent's threads ({@link useReferencePage}).
 */
export interface MessageScope {
  here: readonly ThreadData[]
  parent: readonly ThreadData[] | 'page-parent'
}

export function messageScope(pageThreads: readonly ThreadData[], thread?: string): MessageScope {
  if (!thread) return { here: pageThreads, parent: 'page-parent' }
  return { here: pageThreads.filter((t) => t.id === thread), parent: pageThreads.filter((t) => t.id !== thread) }
}

/** The two sections `[` draws for what was typed, from where the box is. */
export function referenceSections(scope: MessageScope, query: string, nameOf?: (pubkey: string) => string): ReferenceSection[] {
  const parent = scope.parent === 'page-parent' ? parentThreads : scope.parent
  const ranked = rankReferences({
    messages: [...messagesOf(scope.here, MESSAGE_TIER.here, nameOf), ...messagesOf(parent, MESSAGE_TIER.parent, nameOf)],
    files: [...folderFiles, ...recentFiles, ...search.hits(query)],
    query,
    ownKinds: [KIND.PROJECT, KIND.ISSUE],
    exclude: openFile ? [openFile] : [],
  })
  // Files, then Messages: the package's order, the same in every app.
  return referenceSectionsOf(ranked).map(({ name, items }) => ({ label: REFERENCE_COPY[name], items: items.map(itemOf) }))
}

/**
 * What `[` offers in a description: files only, as a Leaf page's does — this
 * Folder's first (an issue's project's issues), then the ones you read lately,
 * then what the relay finds by title.
 */
export function fileSections(query: string): ReferenceSection[] {
  const ranked = rankReferences({
    messages: [],
    files: [...folderFiles, ...recentFiles, ...search.hits(query)],
    query,
    ownKinds: [KIND.PROJECT, KIND.ISSUE],
    exclude: openFile ? [openFile] : [],
  })
  return [{ label: REFERENCE_COPY.files, items: ranked.files.map(itemOf) }]
}

/**
 * The chip an edit or a draft opens a message or file reference as: the
 * caption `[` gave it, from the same scope (SHI-49). One it does not know stays
 * the box's `reference` chip, drawn by Ship's own view.
 */
export function referenceCaptions(scope: MessageScope, nameOf?: (pubkey: string) => string): (uri: string) => { label: string; snippet: string } | undefined {
  const parent = scope.parent === 'page-parent' ? parentThreads : scope.parent
  return (uri) => {
    const bare = uri.replace(/^nostr:/i, '').toLowerCase()
    if (bare.startsWith('nevent1')) {
      let id: string
      try {
        id = decodeNevent(bare).id
      } catch {
        return undefined
      }
      const message = [...scope.here, ...parent].flatMap((thread) => [thread.root, ...thread.replies]).find((m) => m.id === id)
      return message ? { label: message.author.name ?? 'Someone', snippet: captionOf(message.body, nameOf) } : undefined
    }
    const file = [...folderFiles, ...recentFiles].find((candidate) => candidate.uri.toLowerCase() === `nostr:${bare}`)
    return file ? { label: file.title, snippet: '' } : undefined
  }
}

/**
 * Publishes what the page knows as `[`'s tiers, and takes it back when the
 * page goes: the file on screen (never offered under Files — its messages lead
 * Messages), its parent's threads (an issue's project), this Folder's files
 * (the Related read's whole listing), and your read markers, of which the
 * newest file addresses become the recently-read tier.
 */
export function useReferencePage({
  address,
  parent,
  folder,
  readState,
}: {
  address: string | undefined
  parent?: readonly ThreadData[]
  folder: readonly ForeignObject[] | undefined
  readState: Record<string, number>
}) {
  useEffect(() => {
    openFile = address ?? null
    parentThreads = parent ?? []
    return () => {
      openFile = null
      parentThreads = []
    }
  }, [address, parent])

  // A refresh of the same Folder keeps its rows until the new answer lands; leaving the page takes them back.
  useEffect(() => {
    if (!folder) return
    let live = true
    fileCandidatesOf(folder, FILE_TIER.folder)
      .then((rows) => {
        if (!live) return
        folderFiles = rows
        notify()
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [folder])
  useEffect(
    () => () => {
      folderFiles = []
      notify()
    },
    [address],
  )

  const recent = Object.entries(readState)
    .filter(([context]) => ADDRESS_RE.test(context))
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_LIMIT)
  // The addresses alone: a marker's time moving does not re-read the files.
  const key = recent
    .map(([context]) => context)
    .sort()
    .join('\n')

  useEffect(() => {
    if (!key) {
      recentFiles = []
      notify()
      return
    }
    let live = true
    const at = new Map(recent)
    fileCandidatesOf({ addresses: [...at.keys()], at }, FILE_TIER.recent)
      .then((rows) => {
        if (!live) return
        recentFiles = rows
        notify()
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is `recent`'s addresses
  }, [key])
}
