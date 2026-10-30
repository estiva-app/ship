import {
  documentLineDrawOf,
  lineDrawOf,
  linesOf,
  referenceOfLink,
  type Embed,
  type LinkResolver,
  type PartPointer,
  type RenderBlock,
  type RenderInline,
} from '@estiva-app/protocol'

/**
 * A line of a message that is only a link to a file or a message, drawn as
 * that file's row in place (SPEC §13.2, §13.6.2; why:
 * https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md).
 * `reference` is the `nostr:` reference the line names; `unreadable` is one
 * that names no address or event id, drawn as the not-available row.
 */
export interface RowLine {
  reference: string
  value?: string
  unreadable?: true
  /** The URL the line was written as, when it was one: a link to one block opens there. */
  url?: string
  /** A document's line whose writer chose its card: the card, in the row's place (§13.3). Never in a message. */
  card?: true
}

/** A paragraph's line that is a row, lifted out as a block of its own, so the row is not drawn inside a `<p>`. */
export const ROW_BLOCK = 'linkRow'

export interface PlacedLines {
  blocks: RenderBlock[]
  /** The row a block of type {@link ROW_BLOCK} draws. */
  rowOf: (block: { type: string; attrs?: Record<string, unknown> }) => RowLine | undefined
  /** The row a list item's only run draws, by that run: a bullet that is only a link keeps its bullet. */
  rowRuns: ReadonlyMap<object, RowLine>
}

const BREAK: RenderInline = { text: '\n', marks: [] }

type LineContext = NonNullable<Parameters<typeof lineDrawOf>[2]> & { stayChip?: (value: string) => boolean }

/** How one line draws: its row (or card), `nothing`, or undefined for a sentence. */
type LineRule = (line: readonly RenderInline[], block: Pick<RenderBlock, 'type'>) => RowLine | 'nothing' | undefined

/** The row a line that is only `drawn.value`'s link draws, read off the run that holds it. */
function rowOfRun(line: readonly RenderInline[], value: string): RowLine | undefined {
  // A lone URL is already its reference here: `linksAsReferences` turned every one this reader can read.
  const run = line.find((r) => r.reference)
  if (!run?.reference) return undefined
  // Its text is the URL as written, for a link (`linksAsReferences` keeps it): a link to one block opens there.
  return { reference: run.reference, value, ...(/^https?:\/\//i.test(run.text) ? { url: run.text } : {}) }
}

function rowLineOf(line: readonly RenderInline[], block: Pick<RenderBlock, 'type'>, context: LineContext): RowLine | 'nothing' | undefined {
  const drawn = lineDrawOf(line, block, context)
  if ((drawn.draw === 'row' || drawn.draw === 'nothing') && context.stayChip?.(drawn.value)) return undefined
  if (drawn.draw === 'nothing') return 'nothing'
  if (drawn.draw === 'unreadable') return { reference: drawn.reference, unreadable: true }
  if (drawn.draw !== 'row') return undefined
  return rowOfRun(line, drawn.value)
}

/** Every top-level paragraph's lines and every list item's only line, by `rule`; the rest as they are. */
function place(blocks: readonly RenderBlock[], rule: LineRule): PlacedLines {
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
        if (d === 'nothing') return
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
        if (d === 'nothing') return []
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
/**
 * Where each of a message's lines draws: a sentence keeps its chips, a line
 * that is only a link to a file or a message is that file's row, and one whose
 * file has a card or a part under the message draws nothing, since the card
 * stands for it (C26). A person or a Folder alone on its line stays a chip,
 * and a quote's or a heading's line is a sentence (protocol `lineDrawOf`).
 *
 * `blocks` is the message's tree after `linksAsReferences`, so a lone app URL
 * this reader can read is already its reference, and one it cannot stays the
 * URL as written. `cards` is `cardsIn`'s answer, `parts` the `part` pointers
 * drawn under the message. `stayChip` keeps a value's lines as sentences: the
 * file a "Mentioned in" list is on draws no card and no row there, only its
 * chip (Miky, WID-3).
 */
export function placeLines(
  blocks: readonly RenderBlock[],
  context: { cards?: readonly Embed[]; parts?: readonly PartPointer[]; resolveLink?: LinkResolver; stayChip?: (value: string) => boolean },
): PlacedLines {
  return place(blocks, (line, block) => rowLineOf(line, block, context))
}

/**
 * Where each of a block document's lines draws, as its editor places them
 * (`LinkPlaces`; protocol `documentLineDrawOf`, SPEC §13.3): a sentence keeps
 * its chips, a line that is only a link is its file's row, or its card in the
 * row's place when its writer chose Card. A description's reading surface
 * draws by it, so nothing moves when the editor arrives.
 *
 * `blocks` is the tree after `linksAsReferences`, as for {@link placeLines}.
 */
export function placeDocumentLines(blocks: readonly RenderBlock[], context: { resolveLink?: LinkResolver } = {}): PlacedLines {
  return place(blocks, (line, block) => {
    const drawn = documentLineDrawOf(line, block, context)
    if (drawn.draw === 'unreadable') return { reference: drawn.reference, unreadable: true }
    if (drawn.draw !== 'row' && drawn.draw !== 'card') return undefined
    const found = rowOfRun(line, drawn.value)
    // A document's reference mark carries its writer's words: only a URL that itself names that file is where it opens (security review).
    const row = found?.url && !(context.resolveLink && referenceOfLink(found.url, context.resolveLink) === found.reference) ? { ...found, url: undefined } : found
    return row && drawn.draw === 'card' ? { ...row, card: true } : row
  })
}
