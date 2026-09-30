import { Extension, type Editor } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { suggestionPopup } from '@estiva-app/ui/editor'

/**
 * The `/` menu of the description and the message box — Katerina, 29 September: Peek's
 * Format section, then Insert (Table, File). The list is the package's
 * `SuggestionMenu`, through `suggestionPopup` (UIG-31, estiva-ui 0.45.0); this
 * says only which rows and what each does.
 *
 * One difference from Peek, on purpose: "Code" makes a code block, as Notion's
 * `/code` does in a document. Peek's makes inline code, which in a message is
 * the more common need.
 */
interface Command {
  id: 'text' | 'heading' | 'subheading' | 'quote' | 'code' | 'bullets' | 'numbers' | 'table' | 'file'
  label: string
  /** What you could type instead — drawn as keys at the right. */
  keys?: string
  section: 'format' | 'insert'
}

const COMMANDS: Command[] = [
  { id: 'text', label: 'Text', section: 'format' },
  { id: 'heading', label: 'Heading', keys: '#', section: 'format' },
  { id: 'subheading', label: 'Subheading', keys: '##', section: 'format' },
  { id: 'quote', label: 'Quote', keys: '>', section: 'format' },
  { id: 'code', label: 'Code', keys: '```', section: 'format' },
  { id: 'bullets', label: 'Bulleted list', keys: '-', section: 'format' },
  { id: 'numbers', label: 'Numbered list', keys: '1.', section: 'format' },
  { id: 'table', label: 'Table', section: 'insert' },
  { id: 'file', label: 'File', section: 'insert' },
]

function run(editor: Editor, range: { from: number; to: number }, command: Command, onFile: (editor: Editor) => void) {
  const chain = editor.chain().focus().deleteRange(range)
  switch (command.id) {
    case 'heading':
      return chain.setHeading({ level: 1 }).run()
    case 'subheading':
      return chain.setHeading({ level: 2 }).run()
    case 'quote':
      return chain.setBlockquote().run()
    case 'code':
      return chain.setCodeBlock().run()
    case 'bullets':
      return chain.toggleBulletList().run()
    case 'numbers':
      return chain.toggleOrderedList().run()
    // Three by three with a header row: the shape the old table button made.
    case 'table':
      return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    case 'file':
      chain.run()
      return onFile(editor)
    default:
      return chain.setParagraph().run()
  }
}

export const DescriptionSlashMenu = Extension.create<{ onFile: (editor: Editor) => void; without: Command['id'][] }>({
  name: 'descriptionSlashMenu',
  addOptions() {
    // `without`: rows this editor cannot save. A message is marker text, which has no table (SPEC §13.2).
    return { onFile: () => {}, without: [] }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<Command>({
        editor: this.editor,
        char: '/',
        // `/` after a space or at the start of a line; never inside a word or an address.
        startOfLine: false,
        items: ({ query }) => COMMANDS.filter((c) => !this.options.without.includes(c.id) && c.label.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }) => run(editor, range, props, this.options.onFile),
        render: suggestionPopup<Command>({
          ariaLabel: 'Commands',
          width: 'w-[300px]',
          maxHeight: 'max-h-[400px]',
          sections: (items) => [
            { label: 'Format', items: items.filter((c) => c.section === 'format') },
            { label: 'Insert', items: items.filter((c) => c.section === 'insert') },
          ],
          itemKey: (c) => c.id,
          row: (c) => ({ label: c.label, shortcut: c.keys }),
        }),
      }),
    ]
  },
})
