import { describe, expect, it } from 'vitest'
import { blockDocumentToMarkerText, encodeNpub, fromEditorDocument, type EditorDocument } from '@estiva-app/protocol'
import { messageReference } from '@estiva-app/conversation'
import { chipsAsReferences } from './composerTriggers'
import { referenceItems, snippetOf } from './mentionables'
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
})

describe('what [ offers', () => {
  const message = (id: string, body: string, kind?: number) => ({ id, kind, body, at: 0, author: { name: 'Bob' } })
  it('lists the page’s messages, the thread being replied to last, and skips what is not an event', () => {
    const a = { id: 'a'.repeat(64), root: message('a'.repeat(64), 'first', 1111), replies: [message('not-an-id', 'fixture')] }
    const b = { id: MSG, root: message(MSG, 'second'), replies: [] }
    const items = referenceItems([b, a], MSG)
    expect(items.map((item) => item.id)).toEqual(['a'.repeat(64), MSG])
    expect(items[0].uri).toBe(messageReference('a'.repeat(64), 1111))
    expect(items[1].uri).toBe(messageReference(MSG, 9))
  })

  it('offers the newest messages: oldest first, as the package keeps the last six, though the page draws newest first', () => {
    const at = (n: number) => ({ id: String(n).repeat(64).slice(0, 64), root: { ...message(String(n).repeat(64).slice(0, 64), `m${n}`), at: n }, replies: [] })
    const items = referenceItems([at(3), at(2), at(1)])
    expect(items.map((item) => item.snippet)).toEqual(['m1', 'm2', 'm3'])
  })

  it('captions a message by its words: marks stripped, a person by name', () => {
    expect(snippetOf(`**Ship** it, nostr:${encodeNpub(BOB)}`, () => 'Bob')).toBe('Ship it, @Bob')
    expect(snippetOf(`# Plan\n- 2026 budget is 40k, ask nostr:${encodeNpub(BOB).toUpperCase()}`, () => 'Bob')).toBe('Plan 2026 budget is 40k, ask @Bob')
  })
})
