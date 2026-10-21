import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import { LiveHeader } from './LiveHeader'

/** Attach without a relay: the picked file, shown from the browser's own memory. */
const pretendUpload = async (file: File) => ({ url: URL.createObjectURL(file), m: file.type || 'application/octet-stream', x: '0'.repeat(64), size: file.size, filename: file.name }) as unknown as Imeta

const LONG = [
  '# Why this exists',
  '',
  'Moving every workspace read and write onto the relay, one surface at a time,',
  'with the old path kept until each is proven.',
  '',
  '## What has to be true first',
  '',
  '- Every published message has a file copy',
  '- The census reads zero, and a guard keeps it there',
  '',
  '> Reads first, because a wrong read is visible and a wrong write is not.',
].join('\n')

const SUMMARY = 'Every read and write on the relay, one surface at a time.'
const LONG_SUMMARY =
  'A summary that runs well past the length it is meant to keep to, so every place that shows it has to decide where to cut it short: two lines in a row, a card or the picker, and all of it on the file’s own page, where whoever can edit it sees the whole text and can shorten it.'

/**
 * The top of a project or an issue page: the title, its summary under it, and the description,
 * always editable, with no box. Click anywhere and the caret is there; Enter in
 * the title moves into the description; each saves when you leave it. `/` in
 * the description opens Format and Insert (tables, files); selecting words
 * shows bold, italic, underline and code; links are drawn as you type.
 */
function Header({
  title: t0 = 'Relay Migration',
  summary: s0 = SUMMARY,
  description: d0 = LONG,
  readOnly,
  issue,
  refuse,
  theirs,
}: {
  /** Someone else's save of the description, arriving 2 s after the page opens — while you are in it, it waits with a line (LTX-3). */
  theirs?: string
  title?: string
  summary?: string
  description?: string
  readOnly?: boolean
  issue?: boolean
  /** The relay's words when it refuses a summary save: the old one stays, your text stays in the field with them. */
  refuse?: string
}) {
  const [title, setTitle] = useState(t0)
  const [summary, setSummary] = useState(s0)
  const [description, setDescription] = useState(d0)
  const [format, setFormat] = useState<ContentFormat>('marker')
  const [by, setBy] = useState<string | null>(null)
  useEffect(() => {
    if (theirs === undefined) return
    const arrives = setTimeout(() => (setDescription(theirs), setBy('Katerina')), 2000)
    return () => clearTimeout(arrives)
  }, [theirs])
  return (
    <LiveHeader
      title={title}
      titlePlaceholder={issue ? 'Untitled issue' : 'Untitled project'}
      onRename={(v) => (setTitle(v), true)}
      summary={summary}
      onSummarize={async (v) => (refuse ? refuse : (setSummary(v), true))}
      description={description}
      format={format}
      // The editor saves with its tag; the app reads that back as 'blocks' (contentFormatOf).
      onDescribe={(v, f) => (setDescription(v), setFormat(f === 'estiva-blocks-1' ? 'blocks' : 'marker'), true)}
      descriptionBy={by}
      readOnly={readOnly}
      upload={pretendUpload}
    />
  )
}

const meta = {
  title: 'Pages/Title and description',
  component: Header,
  // Padded, not centred: in the centred layout a column has no width to take, and a short one shrank to its words.
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

/** A project with its summary under the title, and a description that has headings, a list and a quote. Click anywhere in the title or the summary and type: no box, nothing moves; Enter goes on down the page. */
export const Default: Story = {}

/** A summary past about 240 characters: all of it, on the page. Click it and type: past 240 a count appears, and nothing is refused. */
export const LongSummary: Story = { args: { summary: LONG_SUMMARY } }

/** Nothing written yet: "Untitled issue", a quiet "Add a summary" and "Add a description…", muted, over empty editors. */
export const Empty: Story = { args: { title: '', summary: '', description: '', issue: true } }

/** A reader who cannot write, or an archived file: text, the summary not editable, and no editor is downloaded. */
export const ReadOnly: Story = { args: { readOnly: true } }

/** A reader, and no summary: nothing at all where it would be — no "Add a summary". */
export const ReadOnlyNoSummary: Story = { args: { readOnly: true, summary: '' } }

/** Change the summary and press Enter: the relay refuses it, the old one stays for everyone else, and your text stays where you wrote it with the reason under it. */
/** Someone saves the description while you are in it (LTX-3, as Leaf's page): click into it within 2 s. Their text waits, a line says who saved it, and Load it shows theirs; leave with a change and yours is saved over it. */
export const SomeoneSavedANewerVersion: Story = {
  args: { theirs: '# Why this exists\n\nKaterina rewrote this while you were in it.' },
  // In the description before theirs arrives; the editor is its own chunk, so it is waited for.
  play: async ({ canvasElement }) => {
    type Box = HTMLElement & { editor?: { commands: { focus: (at: string) => void; insertContent: (text: string) => void } } }
    for (let tries = 0; tries < 30; tries++) {
      const box = canvasElement.querySelector<Box>('[aria-label="Description"]')
      if (box?.editor) {
        box.editor.commands.focus('end')
        box.editor.commands.insertContent(' And a line of mine.')
        return
      }
      await new Promise((settle) => setTimeout(settle, 50))
    }
  },
}

export const SummaryRefused: Story ={ args: { refuse: 'Too busy right now — try again in 14s.' } }

/** Links in the description open in a new tab on a click — a bare address and one with words. A click on plain text still places the caret. */
export const WithLinks: Story = {
  args: { description: 'The plan is in [the cut-over checklist](https://example.com/checklist), and the relay notes are at https://example.com/relay.' },
}
