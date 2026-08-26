import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ProjectRail } from './ProjectRail'

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
const PEOPLE = [
  { value: 'ana', name: 'Ana Duarte' },
  { value: 'ravi', name: 'Ravi Mehta' },
]

/** The project page's rail, as production lays it out, from the shared parts. */
const meta = {
  title: 'Projects/ProjectRail',
  component: ProjectRail,
  args: {
    status: 'in_progress',
    statuses: STATUSES,
    onStatusChange: fn(),
    lead: 'ana',
    people: PEOPLE,
    onLeadChange: fn(),
    done: 10,
    total: 14,
    folder: '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34',
    onCopyFolderLink: fn(),
    onPairFolder: fn(),
    archived: false,
    onArchive: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof ProjectRail>

export default meta
type Story = StoryObj<typeof meta>

/** Static: the values as handed in. */
export const Default: Story = {}

/** Working controls: pick a status and an assignee. */
export const Interactive: Story = {
  render: (args) => {
    const [status, setStatus] = useState(args.status)
    const [lead, setLead] = useState(args.lead)
    return <ProjectRail {...args} status={status} onStatusChange={setStatus} lead={lead} onLeadChange={setLead} />
  },
}

/** Nobody assigned, nothing done. */
export const Unassigned: Story = { args: { lead: '', done: 0 } }

/** An archived project offers to unarchive. */
export const Archived: Story = { args: { archived: true, status: 'completed', done: 14 } }
