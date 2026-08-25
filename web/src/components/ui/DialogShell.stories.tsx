import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from './Button'
import { DialogShell } from './DialogShell'
import { Field } from './Field'
import { TextInput } from './TextInput'
import { Textarea } from './Textarea'

/** Peek's DialogShell: backdrop, centred card, fixed header and footer, a body slot. Escape, backdrop and the close button all close it. */
const meta = {
  title: 'Overlays/DialogShell',
  component: DialogShell,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'New project',
    onClose: fn(),
    footer: (
      <>
        <Button variant="muted">Cancel</Button>
        <Button variant="primary">Create project</Button>
      </>
    ),
    children: <p className="text-body-2 text-text-secondary">The body goes here.</p>,
  },
} satisfies Meta<typeof DialogShell>

export default meta
type Story = StoryObj<typeof meta>

/** Always open, over a stand-in page. */
export const Open: Story = {
  render: (args) => (
    <div className="h-screen bg-bg-base p-6 text-body-2 text-text-muted">
      The page behind the dialog.
      <DialogShell {...args} />
    </div>
  ),
}

/** The shape today's "New project" modal will take: title, description, an optional Folder link. */
export const NewProjectForm: Story = {
  render: (args) => (
    <div className="h-screen bg-bg-base p-6 text-body-2 text-text-muted">
      The page behind the dialog.
      <DialogShell {...args} bodyClassName="flex flex-col gap-6">
        <Field label="Title" required>
          <TextInput placeholder="New project title" />
        </Field>
        <Field label="Description">
          <Textarea placeholder="Description (optional)" className="h-[109px]" />
        </Field>
        <Field label="Folder">
          <TextInput placeholder="Pair with an existing Folder — paste a Peek topic link (optional)" />
        </Field>
      </DialogShell>
    </div>
  ),
}

/** Opened from a button, closed by any of its three exits. */
export const OpenAndClose: Story = {
  render: (args) => {
    const [open, setOpen] = useState(false)
    return (
      <div className="h-screen bg-bg-base p-6">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Add project
        </Button>
        {open && (
          <DialogShell
            {...args}
            onClose={() => setOpen(false)}
            footer={
              <>
                <Button variant="muted" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Create project
                </Button>
              </>
            }
          />
        )}
      </div>
    )
  },
}
