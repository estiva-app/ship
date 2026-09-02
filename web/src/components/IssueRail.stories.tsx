import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { IssueRail } from './IssueRail'

const NOW = Math.floor(Date.now() / 1000)
const STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]
const PEOPLE = [
  { value: 'ana', name: 'Ana Duarte' },
  { value: 'ravi', name: 'Ravi Mehta' },
]
const PROJECTS = [
  { value: '', label: 'No project' },
  { value: 'des', label: 'Design System' },
  { value: 'rel', label: 'Relay Migration' },
]

/** The issue page's rail, as production. */
const meta = {
  title: 'Issues/IssueRail',
  component: IssueRail,
  args: {
    status: 'todo',
    statuses: STATUSES,
    onStatusChange: fn(),
    assignee: '',
    people: PEOPLE,
    onAssigneeChange: fn(),
    project: 'des',
    projects: PROJECTS,
    onProjectChange: fn(),
    openedBy: { name: 'Ana Duarte' },
    openedAt: NOW - 36000,
    onCopyReference: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof IssueRail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Working controls. */
export const Interactive: Story = {
  render: (args) => {
    const [status, setStatus] = useState(args.status)
    const [assignee, setAssignee] = useState(args.assignee)
    const [project, setProject] = useState(args.project)
    return (
      <IssueRail
        {...args}
        status={status}
        onStatusChange={setStatus}
        assignee={assignee}
        onAssigneeChange={setAssignee}
        project={project}
        onProjectChange={setProject}
      />
    )
  },
}

/** Assigned, in progress, opened by someone with no published profile. */
export const Assigned: Story = { args: { status: 'in_progress', assignee: 'ravi', openedBy: {} } }
