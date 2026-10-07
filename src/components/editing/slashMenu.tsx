import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { FORMATS, SlashCommands, applyFormat, formatSection, typeTrigger, type BlockTurnInto, type FormatId, type SlashCommand, type SlashSection } from '@estiva-app/ui/editor'

/**
 * The `/` menu of the description and the message box: the package's shared
 * Format section, then Ship's own rows under **Insert** — the one heading every
 * app's own section takes (Miky, CON-27 /land and CON-25 kickoff, 2026-10-02).
 * The trigger and the list are `@estiva-app/ui/editor`'s `SlashCommands`
 * (CON-27); this says only which Insert rows each editor can perform.
 *
 * "Code" makes a code block (`formatSection('block')`, hinted ```` ``` ````),
 * as Notion's `/code` does in a document; Peek's makes inline code, which in a message is the more
 * common need (Katerina, 29 September).
 */

export interface InsertRows {
  /** Insert → File: open the file picker. Omitted, the row is absent. */
  onFile?: (editor: Editor) => void
  /** Insert → Table. A message is marker text, which has no table (SPEC §13.2), so only the description offers it. */
  table?: boolean
  /**
   * Mention, Urgent and Reference: rows that type `@`, `!@` or `[`, so a person
   * finds the triggers from `/` (Miky, CON-25 kickoff). Only where they open a list.
   */
  triggers?: boolean
  /** With `triggers`, the Urgent row. `false` in an edit, which cannot carry urgency (CON-24). */
  urgent?: boolean
}

// The hint is what you would type, as the Format rows show theirs.
const trigger = (label: string, input: string, description: string): SlashCommand => ({
  key: `insert-${label.toLowerCase()}`,
  row: { label, shortcut: input },
  keywords: [input, description],
  run: typeTrigger(input),
})

/** Format, then Insert with what this editor can do. */
export function slashSections({ onFile, table = false, triggers = false, urgent = true }: InsertRows): SlashSection[] {
  const insert: SlashCommand[] = [
    // Three by three with a header row: the shape the old table button made.
    ...(table ? [{ key: 'insert-table', row: { label: 'Table' }, run: (editor: Editor) => void editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }] : []),
    ...(onFile ? [{ key: 'insert-file', row: { label: 'File' }, run: onFile }] : []),
    ...(triggers ? [trigger('Mention', '@', 'Mention a person'), ...(urgent ? [trigger('Urgent', '!@', 'Urgent mention')] : []), trigger('Reference', '[', 'Reference a message')] : []),
  ]
  return [formatSection('block'), ...(insert.length ? [{ label: 'Insert', commands: insert }] : [])]
}

/** Whether a block of text already is what a Format row makes — the row drawn as selected. */
function isFormat(node: ProseMirrorNode, id: FormatId): boolean {
  if (id === 'paragraph') return node.type.name === 'paragraph'
  if (id === 'heading') return node.type.name === 'heading' && node.attrs.level === 1
  if (id === 'subheading') return node.type.name === 'heading' && node.attrs.level === 2
  if (id === 'code') return node.type.name === 'codeBlock'
  return false
}

/** The block menu's Turn into (RIC-18): the `/` menu's Format rows, code as a block, run on the block the caret is in. */
export const TURN_INTO: BlockTurnInto[] = FORMATS.map((format) => ({
  label: format.label,
  run: (editor) => void applyFormat(editor, format.id, 'block'),
  active: (node) => isFormat(node, format.id),
}))

/** `/` for one editor: `ShipSlashMenu(slashSections({ … }))`. */
export const ShipSlashMenu = (sections: readonly SlashSection[]) => SlashCommands.configure({ sections })
