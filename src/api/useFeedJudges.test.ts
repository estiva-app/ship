import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTED_D_TAG, serializeMutedBlob } from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  The facts a feed's judge rests on, read the way every app reads them
  (SPEC §11.8): membership folded from the file's root, its stream and its
  changes; the mute list read, never written. `useFeedJudges.ts` imports the
  relay and the signer, so they are stubbed here and the reads are exercised
  through `readFeedFacts`, which takes its query and decrypt as parameters.
*/
vi.mock('./store', () => ({ relay: {}, signer: { pubkey: 'x' } }))
vi.mock('./nip44', () => ({ nip44: {} }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))

const { feedFactsFilters, readFeedFacts, resetFeedFactsForTests } = await import('./useFeedJudges')

const ME = 'c'.repeat(64)
const OWNER = 'e'.repeat(64)
const ELSE = 'd'.repeat(64)
const FILE = `30851:${OWNER}:6bd072cb-6c30-4883-abb5-faf880d0c444`
const FOLDER = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const file = { addr: FILE, createdAt: 1000 }

let n = 0
const event = (kind: number, pubkey: string, created_at: number, tags: string[][], content = ''): SignedEvent => ({
  id: (++n).toString(16).padStart(64, '0'),
  pubkey,
  kind,
  created_at,
  tags,
  content,
  sig: '0'.repeat(128),
})
const comment = (pubkey: string, at: number, content = 'hi') =>
  event(1111, pubkey, at, [['A', FILE], ['E', 'f'.repeat(64)], ['e', 'f'.repeat(64)], ['a', FILE], ['P', OWNER], ['p', OWNER]], content)
const placement = (at: number, person: string) =>
  event(1851, ELSE, at, [['a', FILE], ['field', 'assignee'], ['value', person], ['h', FOLDER], ['p', person]])
const join = (person: string, value: 'true' | 'false', signer: string, at: number) =>
  event(1851, signer, at, [['a', FILE], ['field', `member:${person}`], ['value', value], ['h', FOLDER], ['p', person]])
const mutedList = (keys: string[], at = 5000) =>
  event(30078, ME, at, [['d', MUTED_D_TAG], ['t', 'estiva-appdata']], `cipher:${serializeMutedBlob(keys, at)}`)

const decrypt = vi.fn(async (c: string) => (c.startsWith('cipher:') ? c.slice('cipher:'.length) : undefined))
const facts = (events: SignedEvent[]) => readFeedFacts(async () => events, decrypt, file, ME)

beforeEach(() => {
  resetFeedFactsForTests()
  decrypt.mockClear()
})

describe("a file's members, read from public events", () => {
  it('asks for the file in one request: its changes, its stream, and the mute list', () => {
    const filters = feedFactsFilters(FILE, ME)
    expect(filters).toHaveLength(4)
    expect(filters[0]).toMatchObject({ kinds: [1851], '#a': [FILE] })
    expect(filters[1]).toMatchObject({ kinds: [1111], '#A': [FILE] })
    expect(filters[2]).toMatchObject({ kinds: [1111], '#a': [FILE] })
    expect(filters[3]).toMatchObject({ kinds: [30078], authors: [ME], '#d': [MUTED_D_TAG] })
  })

  it('makes you a member from a comment that carries only a lowercase a, and holds a repeated event once', async () => {
    const legacy = event(1111, ME, 1500, [['a', FILE]], 'hi')
    const { membership } = await facts([legacy, legacy])
    expect(membership).toEqual({ member: true, since: 1500 })
  })

  it('makes the person who created the file a member from its creation', async () => {
    const asOwner = await readFeedFacts(async () => [], decrypt, file, OWNER)
    expect(asOwner.membership).toEqual({ member: true, since: 1000 })
  })

  it('does not make a bystander a member', async () => {
    expect((await facts([comment(ELSE, 1500)])).membership).toEqual({ member: false })
  })

  it('makes you a member from your first comment', async () => {
    expect((await facts([comment(ME, 1800), comment(ME, 1500)])).membership).toEqual({ member: true, since: 1500 })
  })

  it('makes you a member from the comment that names you', async () => {
    const named = comment(ELSE, 1700, `over to you nostr:${(await import('@estiva-app/protocol')).encodeNpub(ME)}`)
    expect((await facts([named])).membership).toEqual({ member: true, since: 1700 })
  })

  it('makes you a member from a placement that carries your p, and not from one that does not', async () => {
    expect((await facts([placement(1600, ME)])).membership).toEqual({ member: true, since: 1600 })
    const withoutP = event(1851, ELSE, 1600, [['a', FILE], ['field', 'assignee'], ['value', ME], ['h', FOLDER]])
    expect((await facts([withoutP])).membership).toEqual({ member: false })
  })

  it('ends at your own leave, and only yours', async () => {
    const added = join(ME, 'true', ELSE, 1600)
    expect((await facts([added, join(ME, 'false', ME, 1700)])).membership).toEqual({ member: false })
    expect((await facts([added, join(ME, 'false', ELSE, 1700)])).membership).toEqual({ member: true, since: 1600 })
  })

  /* SHI-31: the Members dialog's roster comes from the same read, and the same fold. */
  it('lists every member — the owner, whoever commented or was added — and nobody who left', async () => {
    const { members } = await facts([comment(ELSE, 1500), join(ME, 'true', ELSE, 1600), join(ME, 'false', ME, 1700)])
    expect([...members.keys()].sort()).toEqual([ELSE, OWNER].sort())
    expect(members.get(ELSE)).toEqual({ member: true, since: 1500 })
  })
})

describe('the mute list is read, not written', () => {
  it('mutes what the list names', async () => {
    const { muted } = await facts([mutedList([FILE])])
    expect(muted?.has(FILE)).toBe(true)
  })

  it('mutes nothing when there is no list', async () => {
    expect((await facts([])).muted?.size).toBe(0)
  })

  it('says the mutes are unknown, not none, when the list will not decrypt, and does not ask again at once', async () => {
    const broken = event(30078, ME, 5000, [['d', MUTED_D_TAG]], 'not a cipher')
    expect((await facts([broken])).muted).toBeUndefined()
    expect((await facts([broken])).muted).toBeUndefined()
    expect(decrypt).toHaveBeenCalledTimes(1)
    // A different list is tried straight away.
    expect((await facts([mutedList([FILE], 6000)])).muted?.has(FILE)).toBe(true)
  })

  it("ignores somebody else's list", async () => {
    const theirs = { ...mutedList([FILE]), pubkey: ELSE }
    expect((await facts([theirs])).muted?.size).toBe(0)
  })

  it('decrypts a list once, not on every refresh', async () => {
    const list = mutedList([FILE])
    await facts([list])
    await facts([list])
    expect(decrypt).toHaveBeenCalledTimes(1)
    await facts([mutedList([], 6000)])
    expect(decrypt).toHaveBeenCalledTimes(2)
  })
})
