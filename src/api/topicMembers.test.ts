/**
 * Explore's Members column and a topic's people (readTopicMembers, readTopicPlace) read a topic's changes naming
 * someone with a profile, never every change it ever had (18d151fb; record
 * a-membership-change-names-the-person-it-is-about), and still list who joined.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'

const ME = 'a'.repeat(64)
const KATERINA = 'b'.repeat(64)
const TEAM = '85db5b59-9e49-4ea1-8e93-3d2a2d78c048'
const D = 'd68a8c78-5ec7-4652-b236-89ab57ac5b1e'
const TOPIC = `30840:${ME}:${D}`

let n = 0
const event = (e: Partial<SignedEvent> & { kind: number; tags: string[][] }): SignedEvent =>
  ({ id: String(++n).padStart(64, '0'), pubkey: ME, created_at: 1_700_000_000 + n, content: '', sig: '', ...e }) as SignedEvent
const root = event({ kind: 30840, tags: [['d', D], ['h', TEAM]] })
const rename = event({ kind: 1851, tags: [['a', TOPIC], ['O', D], ['field', 'title'], ['value', 'Renamed'], ['h', TEAM]] })
const listed = event({ kind: 1851, tags: [['a', TOPIC], ['O', D], ['field', 'lists:x'], ['value', 'true'], ['h', TEAM]] })
const joined = event({ kind: 1851, pubkey: KATERINA, tags: [['a', TOPIC], ['O', D], ['field', `member:${KATERINA}`], ['value', 'true'], ['h', TEAM], ['p', KATERINA]] })
const profiles = [ME, KATERINA].map((pubkey) => event({ kind: 0, pubkey, tags: [] }))
const stored = [root, rename, listed, joined, ...profiles]

const answers = (f: Record<string, unknown>, e: SignedEvent) =>
  Object.entries(f).every(([k, v]) =>
    k === 'kinds' ? (v as number[]).includes(e.kind) : k === 'authors' ? (v as string[]).includes(e.pubkey) : k.startsWith('#') ? e.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1])) : true,
  )
const asked: Record<string, unknown>[] = []
const answer = async (filters: Record<string, unknown>[]) => {
  asked.push(...filters)
  return stored.filter((e) => filters.some((f) => answers(f, e)))
}
// `vi.mock` is lifted above the constants: the relay answers through this hoisted slot.
const relaySlot = vi.hoisted(() => ({ answer: undefined as undefined | ((f: Record<string, unknown>[]) => Promise<unknown[]>) }))
relaySlot.answer = answer

vi.mock('./store', () => ({
  relay: { query: (f: Record<string, unknown>[]) => relaySlot.answer!(f), queryAll: (f: Record<string, unknown>[]) => relaySlot.answer!(f) },
  signer: { pubkey: 'a'.repeat(64) },
}))

const { readTopicMembers, readTopicPlace } = await import('./foreign')
const { resetProfileKeysForTests } = await import('./profileKeys')

const topic = { address: TOPIC, folder: TEAM } as Parameters<typeof readTopicMembers>[0][number]
const changesAsked = () => asked.filter((f) => (f.kinds as number[]).includes(1851))

beforeEach(() => {
  asked.length = 0
  resetProfileKeysForTests()
})

describe("a topic's people are read from the changes naming someone (18d151fb)", () => {
  it("Explore's Members lists who joined, and reads no rename or listed file of the topic", async () => {
    const members = await readTopicMembers([topic])
    expect(members.get(TOPIC)).toContain(KATERINA)
    expect(changesAsked().length).toBeGreaterThan(0)
    for (const f of changesAsked()) expect(f['#p']).toEqual([ME, KATERINA])
  })

  it("a topic's page lists who joined, and reads no rename or listed file of the topic", async () => {
    const { listed: people, events } = await readTopicPlace({ address: TOPIC, folder: TEAM })
    expect(people.map((p) => p.pubkey)).toContain(KATERINA)
    expect(events).not.toContain(rename)
    expect(events).not.toContain(listed)
  })

  it("when the profiles cannot be read, Explore's Members and the members pill reject rather than say nobody joined", async () => {
    // A topic's people are read by the changes naming each person with a profile (conversation 0.47): without them there is no read.
    relaySlot.answer = async (filters) => {
      if (filters.some((f) => (f.kinds as number[]).includes(0))) throw new Error('429')
      return answer(filters)
    }
    try {
      await expect(readTopicMembers([topic])).rejects.toThrow()
      await expect(readTopicPlace(topic)).rejects.toThrow()
      expect(changesAsked()).toEqual([])
    } finally {
      relaySlot.answer = answer
    }
  })
})
