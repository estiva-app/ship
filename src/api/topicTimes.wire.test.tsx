/**
 * A topic's activity by the relay's times read (ALO-22), at the wire: Ship's
 * real relay client and its NIP-11 cache over a relay held in memory, reached
 * by `fetch`. Where the relay's NIP-11 offers `file_list.times`, the sidebar's
 * read of your topics and Explore's Last active learn when a listed project
 * last changed from a `"fields": "times"` read, never by reading its changes;
 * where it does not, they read its changes as before. Either way the topic is
 * as new as the project's last change.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-relay-may-answer-when-a-file-changed-without-the-change.md
 */
import { relayAnswer } from '@/test/listRead'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileTimes, SignedEvent, UnsignedEvent } from '@estiva-app/protocol'

const ME = 'c'.repeat(64)
const OWNER = 'a'.repeat(64)
const TEAM = '7b32200c-e4c0-4216-b79a-8490fc05e0bd'
const TOPIC = `30840:${OWNER}:t`
const PROJECT = `30850:${OWNER}:p`

let held: SignedEvent[] = []
/** Every filter the tab sent to `/query`. */
let asked: Record<string, unknown>[] = []
let count = 0

const tagOf = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const addrOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${tagOf(event, 'd')}`

function matches(f: Record<string, unknown>, event: SignedEvent): boolean {
  for (const [key, want] of Object.entries(f)) {
    const values = want as unknown[]
    if (key === 'kinds' && !values.includes(event.kind)) return false
    if (key === 'authors' && !values.includes(event.pubkey)) return false
    if (key === 'ids' && !values.includes(event.id)) return false
    if (key.startsWith('#') && !event.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))) return false
  }
  return true
}

/** The times read as the relay answers it (SPEC §6.13): each file asked, its current changes' times and field names. */
function times(filters: Record<string, unknown>[]): FileTimes[] {
  const out: FileTimes[] = []
  for (const root of held.filter((event) => event.kind !== 1851 && filters.some((f) => matches(f, event)))) {
    const a = addrOf(root)
    const changes = held.filter((event) => event.kind === 1851 && tagOf(event, 'a') === a)
    out.push({ a, created_at: root.created_at, h: tagOf(root, 'h') ?? null, changes: changes.map((c) => ({ id: c.id, created_at: c.created_at, fields: [tagOf(c, 'field')!] })) })
  }
  return out
}

function answer(filters: Record<string, unknown>[]): unknown {
  asked.push(...filters)
  if (filters.some((f) => f.fields === 'times')) return { times: times(filters) }
  // The list read (`fields: 'newest'`) answered as the relay does: each file with its fields' current changes.
  return relayAnswer(held, filters, (event, f) => matches(f, event)).sort((x, y) => y.created_at - x.created_at)
}

/** The relay as Ship's `Relay` reaches it: NIP-11 by GET, `/query` by POST. */
const fakeFetch = async (url: string, init?: { method?: string; body?: string }) => {
  const json = (body: unknown) => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) })
  if (!init?.method || init.method === 'GET') return json({ file_list: { newest: true, text: true, times: true } })
  if (url.endsWith('/query')) return json(answer(JSON.parse(init.body ?? 'null')))
  throw new Error(`unexpected ${url}`)
}

vi.mock('../nostr/signer', async (original) => {
  const signer = {
    pubkey: ME,
    sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, pubkey: ME, id: (++count).toString(16).padStart(64, '0'), sig: '0'.repeat(128) }),
  }
  return { ...(await original<typeof import('../nostr/signer')>()), localSigner: () => signer, estivaIdSigner: () => signer }
})
vi.mock('../auth/estivaId', async (original) => ({ ...(await original<object>()), heldToken: () => null, heldBearer: () => undefined, renew: async () => null }))
vi.mock('./clock', () => ({ clockProblem: async () => null, relayClockSkew: async () => 0 }))

let seq = 0
const event = (kind: number, tags: string[][], pubkey = OWNER, at = 1_700_000_000 + ++seq): SignedEvent =>
  ({ id: String(++count).padStart(64, 'e'), sig: '0'.repeat(128), pubkey, created_at: at, kind, tags, content: '' }) as SignedEvent

/** Last week: the topic, you in it, the project it lists. Then the project's status moved, its newest change. */
const MOVED_AT = 1_700_500_000
function workspace() {
  held = [
    event(30840, [['d', 't'], ['title', 'Launch'], ['h', TEAM]]),
    event(1851, [['a', TOPIC], ['O', 't'], ['field', `member:${ME}`], ['value', 'true'], ['p', ME], ['h', TEAM]], ME),
    event(1851, [['a', TOPIC], ['O', 't'], ['field', 'lists:p'], ['value', 'true'], ['h', TEAM], ['o', 'p']]),
    event(30850, [['d', 'p'], ['title', 'Website'], ['h', TEAM]]),
    event(1851, [['a', PROJECT], ['O', 'p'], ['field', 'status'], ['value', 'in_progress'], ['h', TEAM]], OWNER, MOVED_AT),
  ]
}

/** A fresh tab: the page's modules loaded anew, so the relay's NIP-11 is read again. */
async function freshTab() {
  vi.resetModules()
  return { foreign: await import('./foreign'), topics: await import('./topics') }
}

const timesAsked = () => asked.filter((f) => f.fields === 'times')
/** A read of the project's changes themselves (kind 1851 by its `a`). */
const changesAsked = () => asked.filter((f) => (f.kinds as number[] | undefined)?.includes(1851) && (f['#a'] as string[] | undefined)?.includes(PROJECT))

beforeEach(() => {
  asked = []
  workspace()
  vi.stubGlobal('fetch', fakeFetch)
})

describe("Ship's sidebar: your topics' activity by the relay's times read", () => {
  it('learns when a listed project changed from the times read, never reading its changes', async () => {
    const { foreign } = await freshTab()
    const read = await foreign.readSidebarTopics(async () => undefined)

    expect(read.topics.map((topic) => topic.address)).toEqual([TOPIC])
    expect(read.at.get(TOPIC)).toBe(MOVED_AT)
    expect(timesAsked()).toContainEqual({ fields: 'times', kinds: [30850], '#d': ['p'] })
    expect(changesAsked()).toEqual([])
  })
})

describe("Explore topics' Last active by the relay's times read", () => {
  async function lastActive() {
    const { foreign, topics } = await freshTab()
    const read = await foreign.readAllTopics()
    asked = []
    const { result } = renderHook(() => topics.useTopicActivity(read, [TOPIC]))
    await waitFor(() => expect(result.current.values).toBeDefined())
    return result.current.values!.get(TOPIC)
  }

  it('learns when a listed project changed from the times read, never reading its changes', async () => {
    expect(await lastActive()).toBe(MOVED_AT)
    expect(timesAsked()).toContainEqual({ fields: 'times', kinds: [30850], '#d': ['p'] })
    expect(changesAsked()).toEqual([])
  })
})
