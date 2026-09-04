/**
 * The seam between what is stored and what is edited — SPEC §13, RIC-14.
 *
 * It replaces `description.test.ts`, which asked the same questions of the
 * marker-text seam: which saves write a document, which bodies are left as
 * they are, and whether an edit keeps the ids a comment is anchored to. The
 * answers moved because the editor holds the document now, so the ids are on
 * the blocks rather than matched back onto them.
 *
 * The conversions themselves are `@estiva-app/protocol`'s and are tested there
 * against 152 real bodies. What is Ship's, and what is here, is the
 * translation to ProseMirror and the three things it must not lose.
 */
import { describe, it, expect } from 'vitest'
import { parseBlockDocument, type BlockDocument } from '@estiva-app/protocol'
import {
  documentFor,
  fromEditorDocument,
  publishableFrom,
  toEditorDocument,
  type EditorDocument,
} from './blockEditor'

const idsOf = (json: string) => parseBlockDocument(json).content.map((b) => b.id)
const open = (value: string, format: 'marker' | 'blocks' = 'marker') =>
  toEditorDocument(documentFor(value, format))
/** Open a body, change nothing, save — the round trip every edit starts from. */
const reopen = (value: string, format: 'marker' | 'blocks' = 'marker') =>
  publishableFrom(open(value, format))

describe('what the editor opens with', () => {
  it('turns a legacy marker body into blocks to edit', () => {
    const doc = open('# Title\n\na **bold** word')
    expect(doc.content.map((n) => n.type)).toEqual(['heading', 'paragraph'])
    expect(doc.content[0].attrs?.level).toBe(1)
    expect(doc.content[1].content?.some((n) => n.marks?.some((m) => m.type === 'bold'))).toBe(true)
  })

  it('reads a body that merely looks like a document as marker text — §13.4', () => {
    // No tag means marker text, however much the body resembles a document.
    // Guessing here would silently reclassify 731 published bodies.
    const looksLikeOne = '{"type":"doc","content":[]}'
    const doc = open(looksLikeOne)
    expect(doc.content[0].content?.[0].text).toContain('"type":"doc"')
  })

  it('shows what is stored when a body is tagged blocks and is not one', () => {
    // Losing anchors on an already-broken body beats showing an empty editor
    // over something that has text in it.
    const doc = open('not a document', 'blocks')
    expect(doc.content[0].content?.[0].text).toBe('not a document')
  })

  it('opens an empty description as an empty document', () => {
    expect(open('   ').content).toEqual([])
  })
})

describe('what a save publishes', () => {
  it('writes a block document and declares the format', () => {
    const { value, contentFormat } = reopen('# Title\n\npara')
    expect(contentFormat).toBe('estiva-blocks-1')
    const doc = parseBlockDocument(value)
    expect(doc.content.map((b) => b.type)).toEqual(['heading', 'paragraph'])
    expect(doc.content.every((b) => b.id.length >= 8)).toBe(true)
  })

  it('declares nothing for an empty description, and writes empty text', () => {
    // `{"type":"doc","content":[]}` in a `value` tag is a worse thing for
    // another app to receive than "". An editor left empty is that case: it
    // holds one empty paragraph, not nothing.
    expect(publishableFrom({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({ value: '' })
    expect(publishableFrom({ type: 'doc', content: [] })).toEqual({ value: '' })
  })

  it('round-trips a document unchanged, ids included', () => {
    const first = reopen('# T\n\none\n\ntwo')
    const again = publishableFrom(open(first.value, 'blocks'))
    expect(again.value).toBe(first.value)
    expect(idsOf(again.value)).toEqual(idsOf(first.value))
  })
})

describe('the three things it must not lose', () => {
  it('keeps a block id when its text is edited', () => {
    /*
      An anchored comment binds to `<address> + <block id>` (RFC 0.4 §6), so an
      edit that re-mints ids detaches every comment on the page with nothing on
      screen to say so.
    */
    const stored = reopen('# Title\n\nfirst\n\nsecond').value
    const editing = open(stored, 'blocks')
    const second = editing.content[2]
    second.content = [{ type: 'text', text: 'second, edited' }]

    const saved = publishableFrom(editing)
    expect(idsOf(saved.value)).toEqual(idsOf(stored))
  })

  it('keeps ids when blocks are reordered, which position-matching could not', () => {
    /*
      The gain over the seam this replaces. `markerTextToBlockDocument` carried
      ids from the previous document **by position**, so moving a paragraph up
      moved every anchor with the slot rather than with the block — a comment
      silently reattached to different words. The id travels on the block now.
    */
    const stored = reopen('one\n\ntwo').value
    const [firstId, secondId] = idsOf(stored)
    const editing = open(stored, 'blocks')
    editing.content.reverse()

    const saved = parseBlockDocument(publishableFrom(editing).value)
    expect(saved.content.map((b) => b.id)).toEqual([secondId, firstId])
    expect(saved.content[0].content?.[0]).toMatchObject({ text: 'two' })
  })

  it('re-mints a duplicated id rather than publishing a document with two', () => {
    // Copy a block, paste it, and both copies claim the same id — a document
    // `validateBlockDocument` rejects and an anchor pointing at two places.
    const editing = open(reopen('one').value, 'blocks')
    editing.content.push(structuredClone(editing.content[0]))

    const ids = idsOf(publishableFrom(editing).value)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('carries an unknown block through untouched, id and all', () => {
    /*
      §13.3: a reader MUST render an unknown block's inline text and MUST NOT
      drop it silently. An editor is the dangerous case — ProseMirror discards
      a node its schema does not know, and the save after it would delete
      somebody else's table with no error anywhere on the way.
    */
    const stored: BlockDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'before' }] },
        { type: 'table', id: 't1', content: [{ type: 'text', text: 'a table Ship cannot draw' }] },
      ],
    }
    const saved = fromEditorDocument(toEditorDocument(stored))
    expect(saved.content[1]).toEqual(stored.content[1])
  })
})

describe('the two spellings that differ', () => {
  it('moves a reference between a mark and an atom, and back', () => {
    const uri = 'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3ns'
    const stored: BlockDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          id: 'p1',
          content: [
            { type: 'text', text: 'see ' },
            { type: 'text', text: uri, marks: [{ type: 'reference', attrs: { uri } }] },
          ],
        },
      ],
    }
    const editing = toEditorDocument(stored)
    // An atom in the editor: its text is the URI, so there is no prose in it
    // to keep editable, and it can be drawn as the thing it points at.
    expect(editing.content[0].content?.[1]).toEqual({ type: 'reference', attrs: { uri, marks: [] } })
    expect(fromEditorDocument(editing)).toEqual(stored)
  })

  it('keeps a bold reference bold', () => {
    const uri = 'nostr:npub1vankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vankwem8v'
    const stored: BlockDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          id: 'p1',
          content: [{ type: 'text', text: uri, marks: [{ type: 'bold' }, { type: 'reference', attrs: { uri } }] }],
        },
      ],
    }
    expect(fromEditorDocument(toEditorDocument(stored))).toEqual(stored)
  })

  it('moves a line break between a `\\n` and a hardBreak, and back', () => {
    const stored: BlockDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'one\ntwo' }] }],
    }
    const editing = toEditorDocument(stored)
    expect(editing.content[0].content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text'])
    expect(fromEditorDocument(editing)).toEqual(stored)
  })

  it('unwraps a list item from the paragraph ProseMirror needs around it', () => {
    /*
      §13.3's list item holds inline runs and ProseMirror's holds blocks. It
      matters because `RichText` draws a list item's *inline* content — a list
      item that came back holding a paragraph would render as an empty bullet.
    */
    const stored = parseBlockDocument(reopen('- one\n- two').value)
    const editing = toEditorDocument(stored)
    expect(editing.content[0].content?.[0].content?.[0].type).toBe('paragraph')
    expect(fromEditorDocument(editing)).toEqual(stored)
  })

  it('keeps a fence literal, newlines and all', () => {
    const stored = parseBlockDocument(reopen('```\nconst a = 1\nconst b = 2\n```').value)
    expect(fromEditorDocument(toEditorDocument(stored))).toEqual(stored)
  })
})

describe('what a person sees is what is stored', () => {
  it('produces the same block ids the reader addresses', () => {
    /*
      RIC-9's shape, guarded: two surfaces meant to match with nothing making
      them. `RichText` puts `data-block-id` on each block and the editor puts
      the same id in `attrs.blockId`, so a comment anchored from the reading
      surface addresses the block the editor is about to save.
    */
    const stored = reopen('# T\n\none').value
    const editing = open(stored, 'blocks') as EditorDocument
    expect(editing.content.map((n) => n.attrs?.blockId)).toEqual(idsOf(stored))
  })
})
