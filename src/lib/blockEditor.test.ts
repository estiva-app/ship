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
      somebody else's block with no error anywhere on the way.

      `widget` is the example now that `table` is editable (UIG-18). It is the
      one type §13.3 names that Ship still has no design for.
    */
    const stored: BlockDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'before' }] },
        { type: 'widget', id: 'w1', content: [{ type: 'text', text: 'a widget Ship cannot draw' }] },
      ],
    }
    const saved = fromEditorDocument(toEditorDocument(stored))
    expect(saved.content[1]).toEqual(stored.content[1])
  })

  /*
    A table, which the editor learnt in UIG-18.

    The protocol names `table` and not its parts, so the nesting is the
    editor's — ProseMirror's names — and what matters here is that the whole
    shape survives a round trip with every id on it. A row or a cell that was
    re-minted on save would detach any comment anchored to it, which is the
    same failure the attachment block had before SHI-2.
  */
  const table: BlockDocument = {
    type: 'doc',
    content: [
      {
        type: 'table',
        id: 't1',
        content: [
          {
            type: 'tableRow',
            id: 'r1',
            content: [
              { type: 'tableHeader', id: 'h1', content: [{ type: 'paragraph', id: 'hp1', content: [{ type: 'text', text: 'Stage' }] }] },
              { type: 'tableHeader', id: 'h2', content: [{ type: 'paragraph', id: 'hp2', content: [{ type: 'text', text: 'Who' }] }] },
            ],
          },
          {
            type: 'tableRow',
            id: 'r2',
            content: [
              { type: 'tableCell', id: 'c1', content: [{ type: 'paragraph', id: 'cp1', content: [{ type: 'text', text: 'Cut-over' }] }] },
              { type: 'tableCell', id: 'c2', content: [{ type: 'paragraph', id: 'cp2', content: [{ type: 'text', text: 'Ada' }] }] },
            ],
          },
        ],
      },
    ],
  }

  it('round-trips a table, every row, cell and id', () => {
    expect(fromEditorDocument(toEditorDocument(table))).toEqual(table)
  })

  it('opens a table as editable nodes rather than one opaque block', () => {
    const node = toEditorDocument(table).content[0]
    expect(node.type).toBe('table')
    expect(node.content?.[0].type).toBe('tableRow')
    expect(node.content?.[0].content?.[0].type).toBe('tableHeader')
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

  it('unwraps a quote the same way, and keeps its text', () => {
    /*
      Found 30 September: the quote's text sits in a paragraph inside the
      quote in ProseMirror, and was read off the quote itself — so a quote
      typed into a description or a message saved empty.
    */
    const stored = parseBlockDocument(reopen('> quoted').value)
    const editing = toEditorDocument(stored)
    expect(editing.content[0].type).toBe('blockquote')
    expect(editing.content[0].content?.[0].type).toBe('paragraph')
    expect(fromEditorDocument(editing)).toEqual(stored)

    // Typed in the editor: two paragraphs in one quote are two lines of it.
    const typed: EditorDocument = { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] }
    const saved = fromEditorDocument(typed)
    expect(saved.content[0].type).toBe('blockquote')
    expect(JSON.stringify(saved.content[0].content)).toContain('one')
    expect(JSON.stringify(saved.content[0].content)).toContain('two')
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

/*
  A file in a description — SPEC §13.3's `attachment` block, SHI-2.

  Until SHI-2 this block was parked as an `unknownBlock`: preserved, never
  produced. Now the editor has a node for it, which moves it out of the
  "carried whole" path and into the converted one — so the questions are the
  converted path's questions. An attribute the schema forgets to declare is
  dropped by ProseMirror and vanishes on save, and that is silent.
*/
const SHA = 'f'.repeat(64)
const attachment = (attrs: Record<string, unknown>, id = 'b2') => ({ type: 'attachment', id, attrs })
const FILE = { url: `/media/${SHA}.png`, m: 'image/png', x: SHA, size: 4096 }

describe('a file in a description', () => {
  it('opens as an editable node rather than an opaque block', () => {
    const doc: BlockDocument = { type: 'doc', content: [attachment(FILE)] }
    const [node] = toEditorDocument(doc).content
    expect(node.type).toBe('attachment')
    expect(node.attrs).toMatchObject({ ...FILE, blockId: 'b2' })
  })

  it('round-trips every imeta field, which is the one that fails silently', () => {
    const rich = { ...FILE, dim: '800x600', thumb: `/media/${SHA}.thumb.jpg`, filename: 'shot.png', alt: 'a screenshot' }
    const doc: BlockDocument = { type: 'doc', content: [attachment(rich)] }
    const back = fromEditorDocument(toEditorDocument(doc))
    expect(back.content[0].attrs).toEqual(rich)
  })

  it('keeps the block id, so a comment anchored to the file still resolves', () => {
    const doc: BlockDocument = { type: 'doc', content: [attachment(FILE, 'anchored')] }
    expect(fromEditorDocument(toEditorDocument(doc)).content[0].id).toBe('anchored')
  })

  /*
    A ProseMirror attribute that was never set is `null`. §13.3's optional
    fields are *absent*, and `imetaTag` would serialise `thumb null` into a tag
    the relay then refuses — taking down a description that looked fine in the
    editor.
  */
  it('writes no null for an optional field the file does not have', () => {
    const doc: BlockDocument = { type: 'doc', content: [attachment(FILE)] }
    const attrs = fromEditorDocument(toEditorDocument(doc)).content[0].attrs ?? {}
    expect(Object.keys(attrs).sort()).toEqual(['m', 'size', 'url', 'x'])
    expect(JSON.stringify(attrs)).not.toContain('null')
  })

  it('publishes as a block document, so the format tag is on the event', () => {
    const doc: BlockDocument = { type: 'doc', content: [attachment(FILE)] }
    const { value, contentFormat } = publishableFrom(toEditorDocument(doc))
    expect(contentFormat).toBe('estiva-blocks-1')
    expect(parseBlockDocument(value)?.content[0].type).toBe('attachment')
  })

  it('survives beside the text it was dropped into', () => {
    const doc: BlockDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'look at this' }] },
        attachment(FILE),
        { type: 'paragraph', id: 'b3', content: [{ type: 'text', text: 'and that' }] },
      ],
    }
    const back = fromEditorDocument(toEditorDocument(doc))
    expect(back.content.map((b) => b.type)).toEqual(['paragraph', 'attachment', 'paragraph'])
  })
})
