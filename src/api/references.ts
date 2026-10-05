/**
 * What `[` offers in Ship (PEE-21): Messages, then Files, ranked by
 * `@estiva-app/conversation`'s `rankReferences` — the order Peek draws too.
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
  messageReference,
  rankReferences,
  referenceSearch,
  type ReferenceCandidate,
  type ReferenceType,
} from '@estiva-app/conversation'
import type { CaptionedItem, ReferenceTriggerOptions } from '@estiva-app/ui/editor'
import { snippetOf } from '@/components/editing/mentionables'
import type { MessageData, ThreadData } from '@/components/ConversationThread'
import { KIND } from '@/nostr/kinds'
import { fileCandidatesOf, searchFiles, type ForeignObject } from './foreign'

export type ReferenceSection = ReturnType<NonNullable<ReferenceTriggerOptions['sections']>>[number]

/** The section headings, Messages above Files. */
export const REFERENCE_COPY = { ariaLabel: 'Messages and files', messages: 'Messages', files: 'Files' }

/** The type word a file row wears (label objects by type). */
const TYPE_WORDS: Record<ReferenceType, string> = { message: 'Message', issue: 'Issue', project: 'Project', topic: 'Topic' }

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

/** Called while `[`'s list is open; told when a tier or a search answer changes. */
export function subscribeReferences(listener: () => void): () => void {
  listeners.add(listener)
  const unsubscribe = search.subscribe(listener)
  return () => {
    listeners.delete(listener)
    unsubscribe()
  }
}

// `[` asks on every keystroke, for every message in scope; a message's row is built once (per tier).
const BUILT = new WeakMap<MessageData, ReferenceCandidate>()

function messageCandidate(message: MessageData, tier: number, nameOf?: (pubkey: string) => string): ReferenceCandidate {
  const known = BUILT.get(message)
  if (known) return known.tier === tier ? known : { ...known, tier }
  const built = {
    id: message.id,
    // The kind rides in the pointer so a reader fetches the manifest and the event together.
    uri: messageReference(message.id, message.kind ?? CHAT_KIND),
    type: 'message' as const,
    kind: message.kind ?? CHAT_KIND,
    title: message.author.name ?? 'Someone',
    caption: snippetOf(message.body, nameOf),
    search: message.body,
    tier,
    at: message.at,
  }
  BUILT.set(message, built)
  return built
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
  return { id: candidate.id, label: TYPE_WORDS[candidate.type], snippet: candidate.title, uri: candidate.uri, description: candidate.caption || undefined }
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
  return [
    { label: REFERENCE_COPY.messages, items: ranked.messages.map(itemOf) },
    { label: REFERENCE_COPY.files, items: ranked.files.map(itemOf) },
  ]
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
