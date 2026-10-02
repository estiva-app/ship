import { describe, expect, it } from 'vitest'
import { blockDocumentToMarkerText, encodeNpub, fromEditorDocument, type EditorDocument } from '@estiva-app/protocol'
import { messageReference } from '@estiva-app/conversation'
import { chipsAsReferences } from './composerTriggers'
import { referenceItems, snippetOf } from './mentionables'

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

  it('captions a message by its words: marks stripped, a person by name', () => {
    expect(snippetOf(`**Ship** it, nostr:${encodeNpub(BOB)}`, () => 'Bob')).toBe('Ship it, @Bob')
  })
})
