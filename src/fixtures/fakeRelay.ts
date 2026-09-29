import { useMemo, useState } from 'react'
import type { Imeta } from '@estiva-app/protocol'
import type { Reaction } from '@/api'
import type { ForeignObject } from '@/api/foreign'
import type { ActivityItem } from '@/components/Activity'
import { referencesInMessages, type MessageData, type ThreadData } from '@/components/ConversationThread'
import type { MentionListViewProps, ThreadListViewProps } from '@/components/conversations/shared'

/**
 * A relay for the stories, so the new design can be tried with
 * every production path live: nothing here draws anything.
 *
 * - **The network, faked at `fetch`.** `PUT /upload` keeps the bytes and answers
 *   with a blob descriptor, `GET /media/<sha>` hands them back. So attaching a
 *   file runs production's `uploadAttachment` (canonicalising, hashing, signing)
 *   and a message's file runs production's `Attachment` (the signed fetch), and
 *   only the wire is pretend. A file over 5 MB is refused the way the relay
 *   refuses one, to show the error line.
 * - **The writes**, as the page's handlers answer: a new conversation, a reply,
 *   a reaction added or taken back, an edit, a deletion. Text with the word
 *   "refuse" in it is refused (`false`), so the box keeps it.
 */

const RELAY = 'http://localhost:3000'
const LIMIT = 5 * 1024 * 1024
const held = new Map<string, { bytes: ArrayBuffer; type: string }>()
let installed = false

/** A picture for a seeded message, drawn once so the story needs no file on disk. */
const seeding = new Map<string, Promise<void>>()
function seedPicture(sha: string, label: string) {
  if (!seeding.has(sha)) seeding.set(sha, drawPicture(sha, label))
  return seeding.get(sha)!
}
async function drawPicture(sha: string, label: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const g = canvas.getContext('2d')!
  g.fillStyle = '#1f2330'
  g.fillRect(0, 0, 640, 400)
  g.fillStyle = '#3b82f6'
  g.fillRect(40, 40, 560, 48)
  g.fillStyle = '#2a2f3d'
  for (let i = 0; i < 5; i++) g.fillRect(40, 116 + i * 52, 560 - i * 60, 32)
  g.fillStyle = '#e4e4e7'
  g.font = '24px sans-serif'
  g.fillText(label, 56, 72)
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'))
  held.set(sha, { bytes: await blob.arrayBuffer(), type: 'image/png' })
}

export function installFakeRelay() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === `${RELAY}/upload` && init?.method === 'PUT') {
      const sha = new Headers(init.headers).get('x-sha-256') ?? ''
      const type = new Headers(init.headers).get('content-type') ?? 'application/octet-stream'
      const bytes = init.body as ArrayBuffer
      await new Promise((r) => setTimeout(r, 600))
      if (bytes.byteLength > LIMIT) return new Response('file too large: the limit is 5 MB', { status: 413 })
      held.set(sha, { bytes, type })
      const ext = type.split('/')[1]?.split('+')[0] ?? 'bin'
      return new Response(JSON.stringify({ url: `${RELAY}/media/${sha}.${ext}`, sha256: sha, size: bytes.byteLength, type }), { status: 200 })
    }
    const media = url.match(/\/media\/([0-9a-f]{64})/)
    if (url.startsWith(RELAY) && media) {
      await seeding.get(media[1])
      const blob = held.get(media[1])
      if (!blob) return new Response('not found', { status: 404 })
      return new Response(blob.bytes.slice(0), { status: 200, headers: { 'content-type': blob.type } })
    }
    return real(input, init)
  }
}

/** The seeded screenshot: an `imeta` exactly as the relay would have written it. */
export const SHOT_SHA = 'a'.repeat(64)
export const SHOT: Imeta = { url: `${RELAY}/media/${SHOT_SHA}.png`, m: 'image/png', x: SHOT_SHA, size: 48213, filename: 'board-after-reload.png' }
export const LOG_SHA = 'b'.repeat(64)
export const LOG: Imeta = { url: `${RELAY}/media/${LOG_SHA}.txt`, m: 'text/plain', x: LOG_SHA, size: 2210, filename: 'fold-trace.txt' }
void seedPicture(SHOT_SHA, 'Board columns after a reload')
held.set(LOG_SHA, { bytes: new TextEncoder().encode('fold pass 1\nfold pass 2\n').buffer as ArrayBuffer, type: 'text/plain' })

/** A pointer at a Ship issue, and the issue it resolves to. */
export const ISSUE_POINTER =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'
const POINTED: ForeignObject = {
  ref: '30851:b3b3:rel4',
  eventId: 'e',
  kind: 30851,
  widget: 'card',
  appName: 'Ship',
  slots: { title: { value: 'Fold the change stream once per read' }, status: { value: 'In Progress', colour: 'blue' } },
  meta: [{ label: 'REL-4', value: '' }],
  comments: [],
  openUrl: '#',
} as unknown as ForeignObject

export const ME = 'me0000000000'

export interface FakeRelayOptions {
  threads: ThreadData[]
  mentioned: ActivityItem[]
  /** pubkey → name, for reactions and mentions. */
  people: Record<string, string>
  me: MessageData['author']
  reactions?: Record<string, Reaction[]>
  unread?: Record<string, string>
  signedOut?: boolean
  upload?: (file: File) => Promise<Imeta>
}

let nextId = 1

export function useFakeRelay({ threads: seedThreads, mentioned: seedMentioned, people, me, reactions: seedReactions = {}, unread, signedOut = false }: FakeRelayOptions): { conversations: ThreadListViewProps; mentioned: MentionListViewProps } {
  installFakeRelay()
  const [threads, setThreads] = useState(seedThreads)
  const [items, setItems] = useState(seedMentioned)
  const [reactions, setReactions] = useState(seedReactions)
  const now = () => Math.floor(Date.now() / 1000)
  const message = (text: string, files: readonly Imeta[]): MessageData => ({ id: `new-${nextId++}`, author: me, by: ME, at: now(), body: text, files: files.length ? [...files] : undefined })
  const refused = (text: string) => /\brefuse\b/i.test(text)

  /** Every write lands on both lists: a message is the same message wherever it is read. */
  const mapAll = (fn: (t: ThreadData) => ThreadData | null) => {
    setThreads((ts) => ts.map(fn).filter((t): t is ThreadData => !!t))
    setItems((is) => is.map((i) => ({ ...i, thread: fn(i.thread) })).filter((i): i is ActivityItem => !!i.thread))
  }
  const mapMessage = (id: string, fn: (m: MessageData) => MessageData) =>
    mapAll((t) => ({ ...t, root: t.root.id === id ? fn(t.root) : t.root, replies: t.replies.map((r) => (r.id === id ? fn(r) : r)) }))

  const reply = async (threadId: string, text: string, files: readonly Imeta[]) => {
    await new Promise((r) => setTimeout(r, 300))
    if (refused(text)) return false
    mapAll((t) => (t.id === threadId ? { ...t, replies: [...t.replies, message(text, files)] } : t))
    return true
  }
  const handlers = signedOut
    ? {}
    : {
        onReact: (id: string, emoji: string, mine?: string) =>
          setReactions((all) => {
            const list = [...(all[id] ?? [])]
            const i = list.findIndex((r) => r.emoji === emoji)
            const was = i >= 0 ? list[i] : { emoji, count: 0, by: [] as string[] }
            const next: Reaction = mine ? { ...was, count: was.count - 1, by: was.by.filter((p) => p !== ME), mine: undefined } : { ...was, count: was.count + 1, by: [...was.by, ME], mine: `r-${nextId++}` }
            if (i >= 0) list[i] = next
            else list.push(next)
            return { ...all, [id]: list.filter((r) => r.count > 0) }
          }),
        onDeleteMessage: async (id: string) => {
          // The relay's rule: a root's replies stay, the next one opening the conversation.
          mapAll((t) => {
            if (t.root.id === id) return t.replies.length ? { ...t, root: t.replies[0], replies: t.replies.slice(1) } : null
            return { ...t, replies: t.replies.filter((r) => r.id !== id) }
          })
          return true
        },
        onEditMessage: async (id: string, body: string) => {
          await new Promise((r) => setTimeout(r, 300))
          if (refused(body)) return false
          mapMessage(id, (m) => ({ ...m, body, editedAt: now() }))
          return true
        },
      }

  const all = useMemo(() => [...threads, ...items.map((i) => i.thread)], [threads, items])
  const resolved = useMemo(() => Object.fromEntries(referencesInMessages(all.flatMap((t) => [t.root, ...t.replies])).map((r) => [r, r === ISSUE_POINTER ? POINTED : null])), [all])
  const nameOf = (pubkey: string) => (pubkey === ME ? 'You' : (people[pubkey] ?? `${pubkey.slice(0, 8)}…`))
  const common = { nameOf, resolved, resolving: false, reactionsBy: reactions, disabledReason: signedOut ? 'Sign in to react or reply.' : undefined, ...handlers }

  return {
    conversations: {
      ...common,
      threads,
      unread,
      about: '30850:a:rel',
      onStart: async (text, files) => {
        await new Promise((r) => setTimeout(r, 300))
        if (refused(text)) return false
        const root = message(text, files)
        setThreads((ts) => [{ id: root.id, root, replies: [] }, ...ts])
        return true
      },
      onReply: reply,
    },
    mentioned: { ...common, items, onReply: reply },
  }
}
