import { describe, expect, it, vi } from 'vitest'

// `[`'s search tier asks the relay once two letters are typed; these tests read no relay.
vi.mock('@/api/foreign', () => ({ searchFiles: vi.fn(async () => []), fileCandidatesOf: vi.fn(async () => []) }))
import { blockDocumentToMarkerText, encodeNpub, fromEditorDocument, type EditorDocument } from '@estiva-app/protocol'
import { FILE_TIER, fileReference, messageReference } from '@estiva-app/conversation'
import { searchFiles } from '@/api/foreign'
import { chipsAsReferences } from './composerTriggers'
import { mentionPeople, snippetOf } from './mentionables'
import { messageScope, referenceSections } from '@/api/references'
import { mentionableIn, rosterOf } from '@/api/people'

const BOB = 'b'.repeat(64)
const MSG = 'd'.repeat(64)
const marker = (doc: unknown) => blockDocumentToMarkerText(fromEditorDocument(chipsAsReferences(doc as never) as EditorDocument))

describe('the chips, as the message box sends them (CON-25)', () => {
  it('writes a person by key, a keyless one by name, and a message by its nevent', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hi ' },
            { type: 'mention', attrs: { id: BOB, label: 'Bob', pubkey: BOB } },
            { type: 'text', text: ' ' },
            { type: 'urgentMention', attrs: { id: 'ann', label: 'Ann', pubkey: null } },
            { type: 'text', text: ' see ' },
            { type: 'captionedReference', attrs: { id: MSG, label: 'Bob', snippet: 'the numbers', uri: messageReference(MSG, 9) } },
          ],
        },
      ],
    }
    expect(marker(doc)).toBe(`hi nostr:${encodeNpub(BOB)} !@Ann see ${messageReference(MSG, 9)}`)
  })

  it('without the chips turned into references, the bridge would drop the person', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi ' }, { type: 'mention', attrs: { label: 'Bob', pubkey: BOB } }] }] }
    expect(blockDocumentToMarkerText(fromEditorDocument(doc as EditorDocument)).trim()).toBe('hi')
    expect(marker(doc)).toBe(`hi nostr:${encodeNpub(BOB)}`)
  })
})

describe('who @ offers', () => {
  const ME = 'a'.repeat(64)
  it('the roster’s members, never the viewer; the snapshot’s people on a relay with no roster', () => {
    const roster = rosterOf([{ kind: 13534, created_at: 1, tags: [['-'], ['member', ME], ['member', BOB], ['member', 'not-a-key']] }])
    expect(roster).toEqual([ME, BOB])
    expect(mentionableIn(roster, [MSG], ME)).toEqual([BOB])
    expect(mentionableIn(rosterOf([]), [ME, MSG], ME)).toEqual([MSG])
  })

  it('only somebody with a profile: a key the roster lists that is no person is left out, as Peek leaves it', () => {
    const profile = (pubkey: string) => (pubkey === BOB ? { name: 'Bob' } : undefined)
    const people = mentionPeople([BOB, MSG], { nameOf: (p) => profile(p)?.name ?? 'short…', personOf: (p) => ({ name: profile(p)?.name }), profileOf: profile as never })
    expect(people.map((p) => p.name)).toEqual(['Bob'])
  })
})

describe('what [ offers', () => {
  const message = (id: string, body: string, kind?: number) => ({ id, kind, body, at: 0, author: { name: 'Bob' } })
  it('Messages: the thread being replied to first, then the rest of the page; skips what is not an event', () => {
    const a = { id: 'a'.repeat(64), root: message('a'.repeat(64), 'first', 1111), replies: [message('not-an-id', 'fixture')] }
    const b = { id: MSG, root: message(MSG, 'second'), replies: [] }
    const [messages, files] = referenceSections(messageScope([b, a], MSG), '')
    expect(messages.label).toBe('Messages')
    expect(messages.items.map((item) => item.id)).toEqual([MSG, 'a'.repeat(64)])
    expect(messages.items[0].uri).toBe(messageReference(MSG, 9))
    expect(messages.items[1].uri).toBe(messageReference('a'.repeat(64), 1111))
    expect(files.label).toBe('Files')
  })

  it('Messages: newest first within a tier, four at most, and typing narrows them', () => {
    const at = (n: number) => ({ id: String(n).repeat(64).slice(0, 64), root: { ...message(String(n).repeat(64).slice(0, 64), `m${n}`), at: n }, replies: [] })
    const page = [1, 2, 3, 4, 5].map(at)
    expect(referenceSections(messageScope(page), '')[0].items.map((item) => item.snippet)).toEqual(['m5', 'm4', 'm3', 'm2'])
    expect(referenceSections(messageScope(page), 'm2')[0].items.map((item) => item.snippet)).toEqual(['m2'])
  })

  it('Files: a file’s summary is its row’s second line, an issue’s project beside its title; no summary, the row as before (SUM-7)', async () => {
    vi.useFakeTimers()
    const file = (d: string, kind: number, title: string, caption: string, summary?: string) => ({
      id: `${kind}:${BOB}:${d}`,
      uri: fileReference(`${kind}:${BOB}:${d}`),
      type: kind === 30851 ? ('issue' as const) : ('document' as const),
      kind,
      title,
      caption,
      summary,
      tier: FILE_TIER.search,
    })
    vi.mocked(searchFiles).mockResolvedValueOnce([
      file('a', 30851, 'Budget review', 'Finance', 'Check the Q4 numbers before Friday'),
      file('b', 30842, 'Budget notes', ''),
    ])
    referenceSections(messageScope([]), 'Budget')
    await vi.advanceTimersByTimeAsync(2000)
    const [, files] = referenceSections(messageScope([]), 'Budget')
    vi.useRealTimers()
    const row = (title: string) => files.items.find((item) => item.label === title)
    expect(row('Budget review')).toMatchObject({ summary: 'Check the Q4 numbers before Friday', description: 'Finance' })
    expect(row('Budget notes')?.summary).toBeUndefined()
    expect(row('Budget notes')?.description).toBeUndefined()
  })

  it('captions a message by its words: marks stripped, a person by name', () => {
    expect(snippetOf(`**Ship** it, nostr:${encodeNpub(BOB)}`, () => 'Bob')).toBe('Ship it, @Bob')
    expect(snippetOf(`# Plan\n- 2026 budget is 40k, ask nostr:${encodeNpub(BOB).toUpperCase()}`, () => 'Bob')).toBe('Plan 2026 budget is 40k, ask @Bob')
  })
})
