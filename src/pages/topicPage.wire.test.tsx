/**
 * A topic's page at the wire (TOPI-8): what the person does in the topic's conversation column and its members pill,
 * and the signed event that reaches the relay. The page, `startConversation`, `addToTopic`, the Store, the signer and
 * the relay client all run; the relay is faked at `fetch` (`POST /events` kept and accepted, `POST /query` answers
 * nothing), as `summary.wire.test.tsx` does.
 *
 * Mocked: the workspace read, the people directory, the Folder listing reads, the clock check, and the topics read,
 * which hands the page one topic its viewer is not in. For read state, the session check and `/nip44` too (a test
 * build has no Estiva ID session); `encrypt` hands the plaintext back so the 30078 on the wire can be read, and
 * `readStateSync.test.ts` covers the blob's own contract.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const NOT_IN = { kind: 'topic', in: false }
const viewer = vi.hoisted(() => ({ following: { kind: 'topic', in: false } as Record<string, unknown> }))

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
vi.mock('@/auth/estivaId', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/auth/estivaId')>()), signedIn: vi.fn(() => false) }))
vi.mock('@/api/nip44', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/nip44')>()
  return { ...actual, nip44: { ...actual.nip44, encrypt: async (plaintext: string) => plaintext } }
})
vi.mock('@/api/clock',async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
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
    // Read per test: where the viewer stands in the topic.
    get following() {
      return viewer.following
    },
    yours: false,
    space: false,
  }
  const read = { me: 'c'.repeat(64), topics: [topic], membership: {}, mentionedIn: new Set() }
  return { ...actual, useTopics: () => read, useYourTopics: () => ({ read: undefined }), useTopicDocuments: () => ({ documents: [], retry: () => {} }) }
})

import { fileContext, me, READ_DWELL_MS, useDirectory, useWorkspace } from '@/api'
import { readTopicPlace } from '@/api/foreign'
import { PUBLISH_DEBOUNCE_MS, resetReadStateForTests } from '@/api/readStateSync'
import { signedIn } from '@/auth/estivaId'
import App from '@/App'

const STATE = { projects: [], issues: [], activity: [], conversations: [], anchors: {}, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {}, folders: [], events: [], threadsAt: { [TEAM]: 1 }, mentionsOf: [TOPIC] } as unknown as WorkspaceState
/** The topic with a conversation Katerina started about it ten minutes ago, which the viewer has not read. */
const SAID_AT = Math.floor(Date.now() / 1000) - 600
const said = { id: 'd'.repeat(64), author: KATERINA, createdAt: SAID_AT, body: 'Shipping Friday?', folder: TEAM, about: [TOPIC] }
const WITH_CONVERSATION = { ...STATE, conversations: [{ id: said.id, root: said, replies: [], about: [TOPIC], createdAt: SAID_AT, lastAt: SAID_AT }], anchors: { [said.id]: [TOPIC] } } as unknown as WorkspaceState
const tag = (event: Signed, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const workspace = (state: WorkspaceState) => ({ state, partial: false, error: null, clock: null, loading: false, busy: false, refresh: vi.fn().mockResolvedValue(undefined), wantThreads: () => {}, live: false })
/** The read-state blobs that went on the wire carrying the topic's own context. */
const topicMarks = () => published.filter((event) => event.kind === 30078 && event.content.includes(JSON.stringify(fileContext(TOPIC))))

beforeEach(() => {
  published.length = 0
  vi.mocked(signedIn).mockReturnValue(false)
  viewer.following = NOT_IN
  vi.mocked(readTopicPlace).mockImplementation(() => Promise.resolve({ listed: [{ pubkey: AUTHOR, level: 'all', ways: [] }], events: [] }) as ReturnType<typeof readTopicPlace>)
  vi.mocked(useWorkspace).mockReturnValue(workspace(STATE))
  vi.mocked(useDirectory).mockReturnValue({ directory: new Map(), nameOf: (k: string) => (k === KATERINA ? 'Katerina' : 'Someone'), personOf: () => ({ name: 'Someone' }), profileOf: () => undefined })
})
afterEach(() => vi.useRealTimers())
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
    // A conversation about a file is a NIP-22 comment on it (SPEC §6.4), not a chat message in the team.
    expect(message.kind).toBe(1111)
    expect(message.pubkey).toBe(me)
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

  it('Leave from the members pill, for someone in the topic at All, takes them out of it, on the topic, in its team', async () => {
    // In at All by their own pick, as Join leaves them: a chosen level, no team default.
    viewer.following = { kind: 'topic', in: true, level: 'all', ways: ['level'] }
    vi.mocked(readTopicPlace).mockImplementation(() => Promise.resolve({ listed: [{ pubkey: AUTHOR, level: 'all', ways: [] }, { pubkey: me, level: 'all', ways: ['level'] }], events: [] }) as ReturnType<typeof readTopicPlace>)
    await open()
    fireEvent.click(await screen.findByRole('button', { name: /members?$/ }))
    const dialog = await screen.findByRole('dialog', { name: /Members/ })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(published.some((event) => event.kind === 1851)).toBe(true))
    const leave = published.find((event) => event.kind === 1851)!
    expect(leave.pubkey).toBe(me)
    expect(tag(leave, 'a')).toBe(TOPIC)
    expect(tag(leave, 'h')).toBe(TEAM)
    // What `switchWrites` gives Not following when only a chosen level holds: the person's own membership, off.
    expect(tag(leave, 'field')).toBe(`member:${me}`)
    expect(tag(leave, 'value')).toBe('false')
  })

  it('the header hides and shows the conversation', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation' }))
    expect(document.querySelector('[data-comments-column]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show conversation' }))
    expect(document.querySelector('[data-comments-column]')).not.toBeNull()
  })

  it('an unread conversation is not marked read while the column is hidden, and is once it is shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetReadStateForTests()
    vi.mocked(signedIn).mockReturnValue(true)
    vi.mocked(useWorkspace).mockReturnValue(workspace(WITH_CONVERSATION))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation' }))
    await act(async () => vi.advanceTimersByTimeAsync((READ_DWELL_MS + PUBLISH_DEBOUNCE_MS) * 3))
    expect(topicMarks()).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Show conversation' }))
    await act(async () => vi.advanceTimersByTimeAsync((READ_DWELL_MS + PUBLISH_DEBOUNCE_MS) * 3))
    await waitFor(() => expect(topicMarks()).toHaveLength(1))
    expect(topicMarks()[0]!.pubkey).toBe(me)
  })

  it('Add from the members pill adds the person picked, not the one adding, on the topic, in its team', async () => {
    // The viewer is a member, so the dialog offers Add; Katerina is in the workspace through her conversation.
    vi.mocked(readTopicPlace).mockImplementation(() => Promise.resolve({ listed: [{ pubkey: AUTHOR, level: 'all', ways: [] }, { pubkey: me, level: 'all', ways: [] }], events: [] }) as ReturnType<typeof readTopicPlace>)
    vi.mocked(useWorkspace).mockReturnValue(workspace(WITH_CONVERSATION))
    const user = userEvent.setup()
    await open()
    await user.click(await screen.findByRole('button', { name: /members?$/ }))
    const dialog = await screen.findByRole('dialog', { name: /Members/ })
    await user.click(await within(dialog).findByRole('button', { name: 'Add members' }))
    await user.type(await screen.findByRole('combobox'), 'Katerina')
    await user.click(await screen.findByRole('option', { name: /Katerina/ }))
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await waitFor(() => expect(published.some((event) => event.kind === 1851)).toBe(true))
    const add = published.find((event) => event.kind === 1851)!
    expect(add.pubkey).toBe(me)
    expect(KATERINA).not.toBe(add.pubkey)
    expect(tag(add, 'field')).toBe(`member:${KATERINA}`)
    expect(tag(add, 'value')).toBe('true')
    expect(tag(add, 'a')).toBe(TOPIC)
    expect(tag(add, 'h')).toBe(TEAM)
  })
})
