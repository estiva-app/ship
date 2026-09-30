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

/**
 * The top of a project or an issue page: the title and the description,
 * always editable, with no box. Click anywhere and the caret is there; Enter in
 * the title moves into the description; each saves when you leave it. `/` in
 * the description opens Format and Insert (tables, files); selecting words
 * shows bold, italic, underline and code; links are drawn as you type.
 */
function Header({ title: t0 = 'Relay Migration', description: d0 = LONG, readOnly, issue }: { title?: string; description?: string; readOnly?: boolean; issue?: boolean }) {
  const [title, setTitle] = useState(t0)
  const [description, setDescription] = useState(d0)
  const [format, setFormat] = useState<ContentFormat>('marker')
  return (
    <LiveHeader
      title={title}
      titlePlaceholder={issue ? 'Untitled issue' : 'Untitled project'}
      onRename={(v) => (setTitle(v), true)}
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

/** A project with a description that has headings, a list and a quote. */
export const Default: Story = {}

/** Nothing written yet: "Untitled issue" and "Add a description…", muted, over empty editors. */
export const Empty: Story = { args: { title: '', description: '', issue: true } }

/** A reader who cannot write: text, and no editor is downloaded. */
export const ReadOnly: Story = { args: { readOnly: true } }
