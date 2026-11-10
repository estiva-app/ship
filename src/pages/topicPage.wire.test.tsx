/**
 * A topic's page at the wire (TOPI-8): what the person does in the topic's conversation column and its members pill,
 * and the signed event that reaches the relay. The page, `startConversation`, `addToTopic`, the Store, the signer and
 * the relay client all run; the relay is faked at `fetch` (`POST /events` kept and accepted, `POST /query` answers
 * nothing), as `summary.wire.test.tsx` does.
 *
 * Mocked: the workspace read, the people directory, the Folder listing reads, the clock check, and the topics read,
 * which hands the page one topic its viewer is not in.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'
import { stubLayout } from '@/test/inlineText'

type Signed = { id: string; kind: number; pubkey: string; sig: string; tags: string[][]; content: string }

const { published } = vi.hoisted(() => {
  const published: Signed[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      published.push(event)
      return new Response(JSON.stringify({ accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { published }
})

const TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const D = '00000000-0000-4000-8000-0000000000a1'
const AUTHOR = 'f'.repeat(64)
const KATERINA = 'b'.repeat(64)
const TOPIC = `30840:${AUTHOR}:${D}`

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  useWorkspace: vi.fn(),
  useDirectory: vi.fn(),
  resolveInbound: vi.fn(),
}))
vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: vi.fn(() => new Promise(() => {})),
  readFolders: vi.fn(() => Promise.resolve([{ id: TEAM, name: 'Estiva HQ', hasState: true, addresses: [] }])),
  readFolderListing: vi.fn(() => Promise.resolve([])),
  readTopicPlace: vi.fn(() => Promise.resolve({ listed: [{ pubkey: AUTHOR, level: 'all', ways: [] }], events: [] })),
}))
vi.mock('@/api/topics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/topics')>()
  const object = { ref: `30840:${'f'.repeat(64)}:00000000-0000-4000-8000-0000000000a1`, eventId: 'e'.repeat(64), kind: 30840, widget: 'card', slots: { title: { value: 'Widgets' } }, meta: [], comments: [], actions: [], viaRecommendation: false }
  const topic = {
    address: object.ref,
    object: { ...object, address: object.ref },
    folder: '3167adea-877f-43c4-96fb-517a2b2d5d24',
    createdAt: 1,
    listed: [],
    following: { kind: 'topic', in: false },
    yours: false,
    space: false,
  }
  const read = { me: 'c'.repeat(64), topics: [topic], membership: {}, mentionedIn: new Set() }
  return { ...actual, useTopics: () => read, useYourTopics: () => ({ read: undefined }), useTopicDocuments: () => ({ documents: [], retry: () => {} }) }
})

import { useDirectory, useWorkspace } from '@/api'
import App from '@/App'

const STATE = { projects: [], issues: [], activity: [], conversations: [], anchors: {}, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {}, folders: [], events: [], threadsAt: { [TEAM]: 1 }, mentionsOf: [TOPIC] } as unknown as WorkspaceState
const tag = (event: Signed, name: string) => event.tags.find((t) => t[0] === name)?.[1]

beforeEach(() => {
  published.length = 0
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, partial: false, error: null, clock: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: (k: string) => (k === KATERINA ? 'Katerina' : 'Someone'), personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
})
stubLayout()

async function open() {
  history.replaceState(null, '', `/topic/widgets-${D}`)
  dispatchEvent(new PopStateEvent('popstate'))
  render(<App />)
  await waitFor(() => expect(document.querySelector('[data-topic-loaded]')).not.toBeNull())
}

describe("A topic's page at the wire (TOPI-8)", () => {
  it('a new conversation from the column is a message about the topic, in its team, from someone not in it', async () => {
    await open()
    const column = document.querySelector('[data-comments-column]') as HTMLElement
    expect(column).not.toBeNull()
    const box = (await within(column).findByRole('textbox', { name: 'Start a conversation…' })) as HTMLElement & { editor: { commands: { insertContent: (s: string) => void } } }
    act(() => box.editor.commands.insertContent('Shipping Friday?'))
    fireEvent.click(within(column).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(published.length).toBeGreaterThan(0))
    const message = published.at(-1)!
    expect(message.content).toContain('Shipping Friday?')
    expect(tag(message, 'h')).toBe(TEAM)
    expect(message.tags.some((t) => (t[0] === 'A' || t[0] === 'a') && t[1] === TOPIC)).toBe(true)
    // Writing in it does not make you a member: no membership change rides with the message.
    expect(published.filter((event) => event.kind === 1851)).toEqual([])
  })

  it('Join from the members pill follows the topic at All, on the topic, in its team, as Peek’s switch writes it', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: /members?$/ }))
    const dialog = await screen.findByRole('dialog', { name: /Members/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(published.some((event) => event.kind === 1851)).toBe(true))
    const follow = published.find((event) => event.kind === 1851)!
    expect(tag(follow, 'a')).toBe(TOPIC)
    expect(tag(follow, 'h')).toBe(TEAM)
    expect(tag(follow, 'field')).toBe(`follow:${follow.pubkey}`)
    expect(tag(follow, 'value')).toBe('all')
  })

  it('the header hides and shows the conversation', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation' }))
    expect(document.querySelector('[data-comments-column]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show conversation' }))
    expect(document.querySelector('[data-comments-column]')).not.toBeNull()
  })
})
