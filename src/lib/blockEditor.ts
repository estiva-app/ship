import {
  BLOCK_DOCUMENT_FORMAT,
  markerTextToBlockDocument,
  newBlockId,
  parseBlockDocument,
  serializeBlockDocument,
  type Block,
  type BlockDocument,
  type ContentFormat,
  type InlineMarkNode,
  type InlineTextNode,
} from '@estiva-app/protocol'

/**
 * A block document, in and out of the editor — RIC-14.
 *
 * **The two models are the same shape already**, which is the reason this file
 * is a translation rather than a design. SPEC §13.3's document is
 * `{type: 'doc', content: [{type, id, attrs, content}]}` and ProseMirror's is
 * `{type: 'doc', content: [{type, attrs, content}]}`; the block types §13.3
 * names are ProseMirror's node names. So the whole conversion is: **the id
 * moves between a field and an attribute**, and a reference moves between a
 * mark and an atom.
 *
 * What this replaces is `description.ts`'s marker-text seam, which said so in
 * its own header: *"In the editor it is marker text, because the editor is a
 * `<textarea>` and will be until somebody designs a block editor."* That is
 * this ticket. Marker text is still what a **legacy** body is written in and
 * this reads it — `markerTextToBlockDocument` — it simply stops being what a
 * person is shown while typing.
 *
 * ## Three things it refuses to lose
 *
 * **An unknown block.** §13.3 says a reader MUST render an unknown block's
 * inline text and MUST NOT drop it silently. An editor is worse than a reader
 * here: ProseMirror discards a node its schema does not know, and the save
 * that follows would delete a `table` or a `widget` from somebody else's
 * description with no error anywhere. So an unknown block becomes an atom that
 * carries its original JSON and hands it back untouched.
 *
 * **A block id.** An anchored comment binds to `<address> + <block id>`
 * (RFC 0.4 §6), so an edit that re-mints ids detaches every comment on the
 * page. Ids ride in `attrs.blockId` and survive every edit that does not
 * replace the block — which is what ProseMirror already gives us, since it
 * preserves attributes across typing.
 *
 * **A duplicate id.** Copy a block, paste it, and both copies carry the same
 * id — a document `validateBlockDocument` rejects and an anchor that points at
 * two places. The second one gets a fresh id on the way out.
 */

/** A ProseMirror/Tiptap node, as JSON. */
export interface EditorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: EditorNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export interface EditorDocument {
  type: 'doc'
  content: EditorNode[]
}

/**
 * The block types the editor's schema knows.
 *
 * Everything else is preserved as an atom rather than edited. Deliberately not
 * `KNOWN_BLOCK_TYPES` — that is what the *protocol* names, and Ship's editor
 * knows a subset of it. `widget` is in the protocol and has no editing design
 * here yet, so it travels through untouched.
 *
 * `attachment` joined the list in SHI-2. It is "editable" only in the sense
 * that the schema has a node for it — the block is an atom with nothing inside
 * to type into, and what the editor offers is inserting and deleting one.
 *
 * **`table` joined in UIG-18**, with the three types inside it. The protocol
 * names only `table`, not its parts, so what a row and a cell are called is
 * decided by the editor that writes them — ProseMirror's names, which is what
 * both apps' editors already are. A reader walks the nesting by name, and an
 * unrecognised shape still renders its text, so a table written by anything
 * else is not lost.
 */
const EDITABLE_BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'attachment',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
])

/**
 * The nodes whose content is other blocks rather than inline runs.
 *
 * A list was the only one until UIG-18, which is why the check was written as
 * two names. A table is four more — itself, its rows, and the two kinds of
 * cell — and reading a cell's paragraphs as inline runs is exactly how the
 * whole table came back empty the first time.
 */
const BLOCK_CONTAINERS = new Set(['bulletList', 'orderedList', 'table', 'tableRow', 'tableHeader', 'tableCell'])

/** The node type an unknown block is parked in. Defined in `UnknownBlock.ts`. */
export const UNKNOWN_BLOCK = 'unknownBlock'
/** The node type a `nostr:` reference is drawn as. Defined in `ReferenceNode.tsx`. */
export const REFERENCE_NODE = 'reference'

const isInlineRun = (content: Block['content']): content is InlineTextNode[] =>
  Array.isArray(content) && content.every((n) => (n as { type?: string }).type === 'text')

// ── Document → editor ────────────────────────────────────────────────────────

/**
 * A run's `\n` is a line break in both models, and they spell it differently:
 * the wire keeps it inside the text, ProseMirror uses a `hardBreak` node. A
 * run split here is rejoined by {@link inlineFromEditor}.
 */
function textNodes(text: string, marks: EditorNode['marks']): EditorNode[] {
  const out: EditorNode[] = []
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ type: 'hardBreak' })
    // ProseMirror has no empty text node, and two consecutive breaks make one.
    if (line !== '') out.push({ type: 'text', text: line, ...(marks?.length ? { marks } : {}) })
  })
  return out
}

function inlineToEditor(runs: readonly InlineTextNode[]): EditorNode[] {
  return runs.flatMap((run) => {
    const marks = run.marks ?? []
    const reference = marks.find((m): m is Extract<InlineMarkNode, { type: 'reference' }> => m.type === 'reference')
    if (reference) {
      /*
        An atom rather than a mark, and the difference is what a person sees.
        A reference's text *is* its URI (`parseInlineReferences` splits the run
        on it), so there is no prose to keep editable — and drawn as a mark it
        would read as `nostr:naddr1…` while typing and as the object's name
        while reading, which is the mode difference this ticket is about.

        The run's other marks ride along so a bold reference comes back bold.
      */
      return [
        {
          type: REFERENCE_NODE,
          attrs: {
            uri: reference.attrs.uri,
            marks: marks.filter((m) => m.type !== 'reference').map((m) => m.type),
          },
        },
      ]
    }
    return textNodes(run.text, marks.map((m) => ({ type: m.type })))
  })
}

function blockToEditor(block: Block): EditorNode {
  if (!EDITABLE_BLOCKS.has(block.type)) {
    return { type: UNKNOWN_BLOCK, attrs: { blockId: block.id, source: block } }
  }
  const attrs = { ...(block.attrs ?? {}), blockId: block.id }

  if (block.type === 'codeBlock') {
    // A fence is literal: its newlines are text, not breaks.
    const text = isInlineRun(block.content) ? block.content.map((n) => n.text).join('') : ''
    return { type: 'codeBlock', attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) }
  }

  if (block.type === 'blockquote') {
    /*
      A quote is the same shape as a list item: §13.3's holds inline runs,
      ProseMirror's holds blocks, and the paragraph is the wrapper. Without it
      the quote's text was read as no text at all — typed into a description or
      a message, a quote saved empty (found 30 September).
    */
    const inline = isInlineRun(block.content) ? inlineToEditor(block.content) : []
    return { type: 'blockquote', attrs, content: [{ type: 'paragraph', content: inline }] }
  }

  if (block.type === 'listItem') {
    /*
      §13.3's list item holds inline runs; ProseMirror's holds blocks. The
      paragraph is that wrapper and nothing else — see `RichText`, which draws
      a list item's *inline* content, so a list item that held anything but one
      paragraph would render empty there.
    */
    const inline = isInlineRun(block.content) ? inlineToEditor(block.content) : []
    return { type: 'listItem', attrs, content: [{ type: 'paragraph', content: inline }] }
  }

  if (block.content === undefined) return { type: block.type, attrs }
  const content = isInlineRun(block.content)
    ? inlineToEditor(block.content)
    : (block.content as Block[]).map(blockToEditor)
  return { type: block.type, attrs, ...(content.length ? { content } : {}) }
}

/** The document a description is written in, whichever model it arrived in. */
export function documentFor(value: string, format: ContentFormat): BlockDocument {
  if (value.trim() === '') return { type: 'doc', content: [] }
  // The classification off the event's tag ('marker' | 'blocks' | 'unknown'),
  // not the tag's value — `BLOCK_DOCUMENT_FORMAT` is what gets written back.
  if (format !== 'blocks') return markerTextToBlockDocument(value)
  try {
    return parseBlockDocument(value)
  } catch {
    /*
      Tagged `blocks` and not a document. Reading it as marker text shows the
      author what is actually stored, which is `descriptionForEditing`'s answer
      to the same case and better than an empty editor over a body that has
      something in it.
    */
    return markerTextToBlockDocument(value)
  }
}

export function toEditorDocument(document: BlockDocument): EditorDocument {
  return { type: 'doc', content: document.content.map(blockToEditor) }
}

// ── Editor → document ────────────────────────────────────────────────────────

/** Mints on a missing id and on a repeat — see the header on duplicates. */
function idFor(node: EditorNode, seen: Set<string>): string {
  const claimed = node.attrs?.blockId
  const id = typeof claimed === 'string' && claimed !== '' && !seen.has(claimed) ? claimed : newBlockId()
  seen.add(id)
  return id
}

function inlineFromEditor(nodes: readonly EditorNode[]): InlineTextNode[] {
  const out: InlineTextNode[] = []
  for (const node of nodes) {
    if (node.type === REFERENCE_NODE) {
      const uri = String(node.attrs?.uri ?? '')
      const carried = Array.isArray(node.attrs?.marks) ? (node.attrs.marks as string[]) : []
      const marks: InlineMarkNode[] = [
        ...carried.map((type) => ({ type }) as InlineMarkNode),
        { type: 'reference', attrs: { uri } },
      ]
      out.push({ type: 'text', text: uri, marks })
      continue
    }
    if (node.type === 'hardBreak') {
      // Rejoin onto the previous run where there is one, so a paragraph is not
      // split into three runs by one break.
      const last = out[out.length - 1]
      if (last && !last.marks?.some((m) => m.type === 'reference')) last.text += '\n'
      else out.push({ type: 'text', text: '\n' })
      continue
    }
    if (node.type !== 'text' || node.text === undefined) continue
    const marks = (node.marks ?? []).map((m) => ({ type: m.type }) as InlineMarkNode)
    const last = out[out.length - 1]
    /*
      Merge runs that carry the same marks. ProseMirror splits a text node
      wherever a mark starts or a break lands, so a plain paragraph typed with
      one Shift+Enter comes back as three nodes; the wire format has no reason
      to keep that seam and a diff of two identical documents should be empty.
    */
    if (last && sameMarks(last.marks ?? [], marks)) last.text += node.text
    else out.push({ type: 'text', text: node.text, ...(marks.length ? { marks } : {}) })
  }
  return out
}

function sameMarks(a: readonly InlineMarkNode[], b: readonly InlineMarkNode[]): boolean {
  if (a.length !== b.length) return false
  if (a.some((m) => m.type === 'reference') || b.some((m) => m.type === 'reference')) return false
  return a.every((m, i) => m.type === b[i].type)
}

function blockFromEditor(node: EditorNode, seen: Set<string>): Block | null {
  if (node.type === UNKNOWN_BLOCK) {
    /*
      Handed back exactly as it arrived, id included. Re-minting it here would
      be the silent deletion this file exists to prevent, one step later: the
      block would survive and every comment anchored to it would not.
    */
    const source = node.attrs?.source as Block | undefined
    if (!source) return null
    seen.add(source.id)
    return source
  }

  const { blockId: _drop, ...rest } = node.attrs ?? {}
  /*
    A ProseMirror attribute that was never set is `null`, and §13.3's optional
    fields are *absent* rather than null — a reader checking `attrs.thumb` copes
    either way, but `imetaTag` would serialise `thumb null` and the relay would
    refuse the event. Dropped here, where every block passes through, rather
    than in the one place that noticed.
  */
  const attrs = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== undefined))
  const id = idFor(node, seen)
  const base = { type: node.type, id, ...(Object.keys(attrs).length ? { attrs } : {}) }

  if (node.type === 'codeBlock') {
    const text = (node.content ?? []).map((n) => n.text ?? '').join('')
    return { ...base, ...(text ? { content: [{ type: 'text', text }] } : {}) }
  }

  if (node.type === 'blockquote') {
    // Back out of the paragraph wrappers; a second paragraph in a quote is a second line of it.
    const inline: InlineTextNode[] = []
    ;(node.content ?? []).forEach((child, i) => {
      if (i > 0) inline.push({ type: 'text', text: '\n' })
      inline.push(...inlineFromEditor(child.content ?? []))
    })
    return { ...base, content: inline }
  }

  if (node.type === 'listItem') {
    // Back out of the paragraph wrapper. A list item carries inline runs on
    // the wire — see `blockToEditor`.
    const inline = (node.content ?? []).flatMap((child) => inlineFromEditor(child.content ?? []))
    return { ...base, content: inline }
  }

  if (BLOCK_CONTAINERS.has(node.type)) {
    const children = (node.content ?? [])
      .map((child) => blockFromEditor(child, seen))
      .filter((b): b is Block => b !== null)
    return { ...base, content: children }
  }

  const content = inlineFromEditor(node.content ?? [])
  return { ...base, ...(content.length ? { content } : {}) }
}

export function fromEditorDocument(document: EditorDocument): BlockDocument {
  const seen = new Set<string>()
  return {
    type: 'doc',
    content: document.content.map((node) => blockFromEditor(node, seen)).filter((b): b is Block => b !== null),
  }
}

/**
 * What a save publishes.
 *
 * An empty description stays empty **text** rather than becoming an empty
 * document — `descriptionForPublishing`'s rule, kept: there is nothing to
 * address, and `{"type":"doc","content":[]}` in a `value` tag is a worse thing
 * for another app to receive than "".
 */
export function publishableFrom(document: EditorDocument): { value: string; contentFormat?: string } {
  const blocks = fromEditorDocument(document)
  const empty = blocks.content.every(
    (b) => b.type === 'paragraph' && (b.content === undefined || b.content.length === 0),
  )
  if (empty) return { value: '' }
  return { value: serializeBlockDocument(blocks), contentFormat: BLOCK_DOCUMENT_FORMAT }
}
