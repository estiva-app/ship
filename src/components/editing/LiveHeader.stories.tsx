import { useState } from 'react'
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
}: {
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

/** A project with its summary under the title, and a description that has headings, a list and a quote. Click the summary to change it. */
export const Default: Story = {}

/** A summary past about 240 characters: all of it, on the page. Click it and type: past 240 a count appears, and nothing is refused. */
export const LongSummary: Story = { args: { summary: LONG_SUMMARY } }

/** Nothing written yet: "Untitled issue", a quiet "Add a summary" and "Add a description…", muted, over empty editors. */
export const Empty: Story = { args: { title: '', summary: '', description: '', issue: true } }

/** A reader who cannot write, or an archived file: text, the summary not clickable, and no editor is downloaded. */
export const ReadOnly: Story = { args: { readOnly: true } }

/** A reader, and no summary: nothing at all where it would be — no "Add a summary". */
export const ReadOnlyNoSummary: Story = { args: { readOnly: true, summary: '' } }

/** Change the summary and press Enter: the relay refuses it, the old one stays, and your text stays in the field with the reason. */
export const SummaryRefused: Story = { args: { refuse: 'Too busy right now — try again in 14s.' } }

/** Links in the description open in a new tab on a click — a bare address and one with words. A click on plain text still places the caret. */
export const WithLinks: Story = {
  args: { description: 'The plan is in [the cut-over checklist](https://example.com/checklist), and the relay notes are at https://example.com/relay.' },
}
