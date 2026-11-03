import { mergeTexts, parseBlockDocument, serializeBlockDocument, type Block, type MergeAsk, type MergeText } from '@estiva-app/protocol'
import type { DocumentAsks } from '@estiva-app/ui/editor'

const BLOCKS = 'estiva-blocks-1'

/**
 * What the description editor holds when a save asks (ALO-1's story): their
 * text, with every change of mine that did not clash merged in and their words
 * in each block that asks, beside mine as I saved it. Nothing is saved until
 * each asked block is chosen.
 *
 * Mine is merged again with each asked block taken as theirs (theirs deleted
 * it: left out), which §13.3 then merges quietly. A block I deleted that they
 * changed cannot be put back where it was from mine, so that merge may ask
 * again: then the editor holds their text alone, and none of their words are lost.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/merging-two-changes-to-one-text-never-loses-words.md
 */
export function documentAsksOf(base: MergeText, theirs: MergeText, mine: MergeText, asks: readonly MergeAsk[]): DocumentAsks {
  const blocks = asks.flatMap((ask) => (ask.block === null ? [] : [ask.block]))
  const plain = { value: theirs.value, theirs: theirs.value, mine: mine.value, blocks, sinceOpened: true }
  if (mine.format !== BLOCKS || theirs.format !== BLOCKS || blocks.length !== asks.length) return plain
  try {
    const asked = new Map(asks.map((ask) => [ask.block!, ask.theirsBlock]))
    const settle = (content: Block[]): Block[] =>
      content.flatMap((block) => {
        if (asked.has(block.id)) {
          const kept = asked.get(block.id)
          return kept ? [kept] : []
        }
        const children = block.content
        if (!children?.length || !('id' in (children[0] as object))) return [block]
        return [{ ...block, content: settle(children as Block[]) }]
      })
    const doc = parseBlockDocument(mine.value)
    const settled = { value: serializeBlockDocument({ ...doc, content: settle(doc.content) }), format: BLOCKS }
    const merged = mergeTexts(base, theirs, settled)
    return merged.merged ? { ...plain, value: merged.merged.value, sinceOpened: undefined } : plain
  } catch {
    return plain
  }
}
