import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
  TOP-5: a file's topics and Add to topic's choices, read through a fake relay
  that answers filters the way the relay does (kinds, authors, `#x` tags), so
  what is tested is what reaches the relay and what comes back drawn.
*/
const held: TestEvent[] = []
const answer = (filters: Record<string, unknown>[]) => held.filter((e) => filters.some((f) => matches(f, e)))
vi.mock('./store', () => ({
  relay: { query: async (filters: Record<string, unknown>[]) => answer(filters), queryAll: async (filters: Record<string, unknown>[]) => answer(filters) },
  signer: { pubkey: 'c'.repeat(64) },
}))

import { readFileTopics, readTopicChoices } from './foreign'

interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

function matches(filter: Record<string, unknown>, e: TestEvent): boolean {
  for (const [key, want] of Object.entries(filter)) {
    if (key === 'limit' || key === 'since' || key === 'until') continue
    const values = want as unknown[]
    if (key === 'kinds' && !values.includes(e.kind)) return false
    if (key === 'authors' && !values.includes(e.pubkey)) return false
    if (key === 'ids' && !values.includes(e.id)) return false
    if (key.startsWith('#') && !e.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))) return false
  }
  return true
}

const ME = 'c'.repeat(64)
const OWNER = 'a'.repeat(64)
const FILE = 'issue-1'
let seq = 0
const event = (kind: number, tags: string[][], pubkey = OWNER, at = 1_700_000_000 + ++seq): TestEvent => ({ id: String(++seq).padStart(64, '0'), sig: '', pubkey, created_at: at, kind, tags, content: '' })
const topic = (d: string, title: string, folder = 'team') => event(30840, [['d', d], ['title', title], ['h', folder]])
const address = (d: string) => `30840:${OWNER}:${d}`
const listing = (d: string, file: string, listed: boolean, folder = 'team') =>
  event(1851, [['a', address(d)], ['O', d], ['field', `lists:${file}`], ['value', listed ? 'true' : 'false'], ['h', folder], ['ts', String(Date.now())], ['o', file]])
const archiving = (d: string, folder = 'team') => event(1851, [['a', address(d)], ['O', d], ['field', 'archived'], ['value', 'true'], ['h', folder]])
const added = (d: string, person: string) => event(1851, [['a', address(d)], ['O', d], ['field', `member:${person}`], ['value', 'true'], ['p', person], ['h', 'team']])

beforeEach(() => {
  held.length = 0
})

describe("a file's topics: the ones whose list names it now", () => {
  it('draws each topic listing the file, A–Z, and none whose newest entry took it off', async () => {
    held.push(topic('t-w', 'Widgets'), topic('t-a', 'Alpha'), topic('t-r', 'Removed'))
    held.push(listing('t-w', FILE, true), listing('t-a', FILE, true), listing('t-r', FILE, true), listing('t-r', FILE, false))
    const topics = await readFileTopics(FILE)
    expect(topics.map((t) => [t.title, t.address, t.folder])).toEqual([
      ['Alpha', address('t-a'), 'team'],
      ['Widgets', address('t-w'), 'team'],
    ])
  })

  it('leaves out a topic the reader cannot read: its root never comes back', async () => {
    held.push(listing('t-hidden', FILE, true))
    expect(await readFileTopics(FILE)).toEqual([])
  })

  it('says an archived topic is archived, so its chip has no Remove', async () => {
    held.push(topic('t-old', 'Old'), listing('t-old', FILE, true), archiving('t-old'))
    expect((await readFileTopics(FILE)).map((t) => [t.title, t.archived])).toEqual([['Old', true]])
  })
})

describe("Add to topic's choices", () => {
  it('puts the topics you are a member of first, then the rest, each A–Z, and leaves archived ones out', async () => {
    held.push(topic('t-z', 'Zeta'), topic('t-b', 'Beta'), topic('t-y', 'Yours'), topic('t-x', 'Archived'))
    held.push(added('t-y', ME), added('t-x', ME), archiving('t-x'))
    // A topic you created is yours from its root.
    held.push(event(30840, [['d', 't-mine'], ['title', 'Mine'], ['h', 'team']], ME))
    const { yours, others } = await readTopicChoices()
    expect(yours.map((t) => t.title)).toEqual(['Mine', 'Yours'])
    expect(others.map((t) => t.title)).toEqual(['Beta', 'Zeta'])
  })
})
