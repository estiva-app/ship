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

import { readFileTopics } from './foreign'
import { readTopicChoices, resetTopicsForTests } from './topics'
import { buildManifest } from '../nostr/manifest'

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
const topic = (d: string, title: string, folder = 'team', parent?: string) => event(30840, [['d', d], ['title', title], ['h', folder], ...(parent ? [['a', parent]] : [])])
const address = (d: string) => `30840:${OWNER}:${d}`
/** Ship's own manifest, so a project resolves as the topic's parent does on production. */
const shipManifest = () => {
  const unsigned = buildManifest(OWNER, Date.now())
  return { ...event(unsigned.kind, unsigned.tags, OWNER), content: unsigned.content }
}
const project = (d: string) => event(30850, [['d', d], ['title', 'Launch'], ['h', 'team']])
const archivingProject = (d: string) => event(1851, [['a', `30850:${OWNER}:${d}`], ['O', d], ['field', 'archived'], ['value', 'true'], ['h', 'team']])
/** A Folder the relay lists for the reader: its state, as `listFolders` reads it. */
const folder = (id: string) => event(39000, [['d', id], ['name', id]])
const listing = (d: string, file: string, listed: boolean, folder = 'team') =>
  event(1851, [['a', address(d)], ['O', d], ['field', `lists:${file}`], ['value', listed ? 'true' : 'false'], ['h', folder], ['ts', String(Date.now())], ['o', file]])
const archiving = (d: string, folder = 'team') => event(1851, [['a', address(d)], ['O', d], ['field', 'archived'], ['value', 'true'], ['h', folder]])
const added = (d: string, person: string) => event(1851, [['a', address(d)], ['O', d], ['field', `member:${person}`], ['value', 'true'], ['p', person], ['h', 'team']])

beforeEach(() => {
  held.length = 0
  resetTopicsForTests()
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

  it('says a topic archived with its project is archived too', async () => {
    held.push(shipManifest(), project('p'), archivingProject('p'), topic('t-under', 'Under', 'team', `30850:${OWNER}:p`), listing('t-under', FILE, true))
    expect((await readFileTopics(FILE)).map((t) => [t.title, t.archived])).toEqual([['Under', true]])
  })
})

describe("Add to topic's choices", () => {
  it('puts the topics you are a member of first, then the rest, each A–Z, and leaves archived ones out', async () => {
    held.push(folder('team'))
    held.push(topic('t-z', 'Zeta'), topic('t-b', 'Beta'), topic('t-y', 'Yours'), topic('t-x', 'Archived'))
    held.push(added('t-y', ME), added('t-x', ME), archiving('t-x'))
    // A topic you created is yours from its root.
    held.push(event(30840, [['d', 't-mine'], ['title', 'Mine'], ['h', 'team']], ME))
    // Archived with its project: read-only, so not offered either.
    held.push(shipManifest(), project('p'), archivingProject('p'), topic('t-under', 'Under', 'team', `30850:${OWNER}:p`))
    // In a Folder the relay does not list for you: it would refuse the entry.
    held.push(topic('t-closed', 'Closed', 'elsewhere'))
    const { yours, others } = await readTopicChoices()
    expect(yours.map((t) => t.title)).toEqual(['Mine', 'Yours'])
    expect(others.map((t) => t.title)).toEqual(['Beta', 'Zeta'])
  })

  it('opened again, gives the choices at once, without asking the relay', async () => {
    held.push(folder('team'), topic('t-b', 'Beta'))
    await readTopicChoices()
    held.push(topic('t-c', 'Gamma'))
    const again = readTopicChoices()
    expect(again).not.toBeInstanceOf(Promise)
    expect((again as Awaited<typeof again>).others.map((t) => t.title)).toEqual(['Beta'])
  })
})
