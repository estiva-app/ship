import { documentLineDrawOf, linesOf, referenceOfLink, type LinkResolver, type RenderBlock, type RenderInline } from '@estiva-app/protocol'
import { ROW_BLOCK, type RowLine as MessageRowLine } from '@estiva-app/conversation'

export { ROW_BLOCK }

/**
 * A line of a description that is only a link to a file or a message, drawn as
 * that file's row in place (SPEC §13.3), or as its card when its writer chose
 * Card. A message's lines are placed by the shared conversation's `placeLines`
 * (ONE-9); a document's by its editor's rule, here.
 */
export interface RowLine extends MessageRowLine {
  /** Its writer chose its card: the card, in the row's place (§13.3). */
  card?: true
}

export interface PlacedLines {
  blocks: RenderBlock[]
  /** The row a block of type {@link ROW_BLOCK} draws. */
  rowOf: (block: { type: string; attrs?: Record<string, unknown> }) => RowLine | undefined
  /** The row a list item's only run draws, by that run: a bullet that is only a link keeps its bullet. */
  rowRuns: ReadonlyMap<object, RowLine>
}

const BREAK: RenderInline = { text: '\n', marks: [] }

/** The row a line that is only `value`'s link draws, read off the run that holds it. */
function rowOfRun(line: readonly RenderInline[], value: string): RowLine | undefined {
  // A lone URL is already its reference here: `linksAsReferences` turned every one this reader can read.
  const run = line.find((r) => r.reference)
  if (!run?.reference) return undefined
  // Its text is the URL as written, for a link (`linksAsReferences` keeps it): a link to one block opens there.
  return { reference: run.reference, value, ...(/^https?:\/\//i.test(run.text) ? { url: run.text } : {}) }
}

/** How one line draws: its row (or card), or undefined for a sentence. */
function documentRowOf(line: readonly RenderInline[], block: Pick<RenderBlock, 'type'>, context: { resolveLink?: LinkResolver }): RowLine | undefined {
  const drawn = documentLineDrawOf(line, block, context)
  if (drawn.draw === 'unreadable') return { reference: drawn.reference, unreadable: true }
  if (drawn.draw !== 'row' && drawn.draw !== 'card') return undefined
  const found = rowOfRun(line, drawn.value)
  // A document's reference mark carries its writer's words: only a URL that itself names that file is where it opens (security review).
  const row = found?.url && !(context.resolveLink && referenceOfLink(found.url, context.resolveLink) === found.reference) ? { ...found, url: undefined } : found
  return row && drawn.draw === 'card' ? { ...row, card: true } : row
}

/**
 * Where each of a block document's lines draws, as its editor places them
 * (`LinkPlaces`; protocol `documentLineDrawOf`, SPEC §13.3): a sentence keeps
 * its chips, a line that is only a link is its file's row, or its card in the
 * row's place when its writer chose Card. A description's reading surface
 * draws by it, so nothing moves when the editor arrives.
 *
 * `blocks` is the tree after `linksAsReferences`. Every top-level paragraph's
 * lines and every list item's only line are placed; the rest stay as they are.
 */
export function placeDocumentLines(blocks: readonly RenderBlock[], context: { resolveLink?: LinkResolver } = {}): PlacedLines {
  const rule = (line: readonly RenderInline[], block: Pick<RenderBlock, 'type'>) => documentRowOf(line, block, context)
  const rows = new Map<object, RowLine>()
  const rowRuns = new Map<RenderInline, RowLine>()
  const out: RenderBlock[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const lines = linesOf(block)
      const drawn = lines.map((line) => rule(line, block))
      if (drawn.every((d) => d === undefined)) {
        out.push(block)
        continue
      }
      let sentence: RenderInline[][] = []
      let first = true
      const flush = () => {
        if (!sentence.length) return
        const inline = sentence.flatMap((line, i) => (i > 0 ? [BREAK, ...line] : line))
        out.push({ ...block, inline, ...(first ? {} : { id: undefined }) })
        first = false
        sentence = []
      }
      lines.forEach((line, i) => {
        const d = drawn[i]
        if (d === undefined) {
          sentence.push(line)
          return
        }
        flush()
        // Not a protocol block: RichText hands a type it has no design for to `renderBlock`. The paragraph's first
        // piece keeps its address, so a link to that block still finds it.
        const row = { type: ROW_BLOCK, attrs: {}, ...(first && block.id ? { id: block.id } : {}) } as unknown as RenderBlock
        first = false
        rows.set(row, d)
        out.push(row)
      })
      flush()
      continue
    }
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const items = (block.children ?? []).flatMap((item) => {
        const lines = linesOf(item)
        if (lines.length !== 1) return [item]
        const d = rule(lines[0], item)
        if (d === undefined) return [item]
        // A fresh run, so the map names this line and no other drawing of the same body.
        const run = { ...lines[0].find((r) => r.reference || r.text.trim())! }
        rowRuns.set(run, d)
        return [{ ...item, inline: [run] }]
      })
      if (items.length) out.push({ ...block, children: items })
      continue
    }
    out.push(block)
  }
  return { blocks: out, rowOf: (block) => rows.get(block), rowRuns }
}
