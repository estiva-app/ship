import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from '@/components/ui/Button'
import { ProjectHeader, type ProjectHeaderProps } from './ProjectHeader'

/** The top of the project page: click the title or the description to edit; Enter commits, Escape cancels. */
const meta = {
  title: 'Projects/ProjectHeader',
  component: ProjectHeader,
  args: {
    title: 'Relay Migration',
    description: 'Moving every workspace read and write onto the relay, one surface at a time.',
    onRename: fn<ProjectHeaderProps['onRename']>(() => true),
    onDescribe: fn<ProjectHeaderProps['onDescribe']>(() => true),
  },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Archived: Story = { args: { archived: true } }

/** No description yet: the placeholder, muted, still clickable. */
export const NoDescription: Story = { args: { description: '' } }

/** Edits stick: rename it, describe it. */
export const Interactive: Story = {
  render: (args) => {
    const [title, setTitle] = useState(args.title)
    const [description, setDescription] = useState(args.description)
    return (
      <ProjectHeader
        {...args}
        title={title}
        description={description}
        onRename={(value) => {
          setTitle(value)
          return true
        }}
        onDescribe={(value) => {
          setDescription(value)
          return true
        }}
      />
    )
  },
}

/** A save that fails keeps the field open with the text in it. */
export const SaveFails: Story = {
  args: { onRename: fn<ProjectHeaderProps['onRename']>(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 800))) },
}

/** With production's "Add issue" beside the title. */
export const WithAddIssue: Story = {
  args: { action: <Button variant="primary">Add issue</Button> },
}
