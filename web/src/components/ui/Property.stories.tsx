import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { Divider } from './Divider'
import { Person } from './Person'
import { ProgressBar } from './ProgressBar'
import { Property } from './Property'
import { Select } from './Select'
import { StatusIcon } from './StatusIcon'

/** Peek's Property. `row` is Peek's; `stacked` is Ship's rail, as production has it. */
const meta = {
  title: 'Primitives/Property',
  component: Property,
  args: { label: 'Status', children: <span className="text-body-2 text-text-primary">In Progress</span> },
  decorators: [
    (Story) => (
      <div className="flex w-[346px] flex-col gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Property>

export default meta
type Story = StoryObj<typeof meta>

const PROJECT_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]
const ISSUE_STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]
const PEOPLE = [
  { value: '', label: 'Unassigned' },
  { value: 'ana', label: 'Ana Duarte' },
  { value: 'ravi', label: 'Ravi Mehta' },
]
const PROJECTS = [
  { value: '', label: 'Inbox (no project)' },
  { value: 'des', label: 'Design System' },
  { value: 'rel', label: 'Relay Migration' },
]

/** Peek's row: the 68px label column. */
export const Row: Story = {}

/** Ship's: the label above, a SectionLabel, the control full width. */
export const Stacked: Story = {
  args: {
    layout: 'stacked',
    children: <Select value="in_progress" onChange={() => {}} options={PROJECT_STATUSES} ariaLabel="Status" />,
  },
}

/**
 * The project page's rail, exactly as production lays it out, from the
 * parts: Status and Assignee as selects, Progress as a bar with its words,
 * Folder as its id in mono with the two actions as buttons, then the danger
 * zone below a divider — Archive as a button, Delete as a destructive one.
 */
export const ProjectRail: Story = {
  render: () => {
    const [status, setStatus] = useState('in_progress')
    const [lead, setLead] = useState('ana')
    return (
      <>
        <Property layout="stacked" label="Status">
          <Select value={status} onChange={setStatus} options={PROJECT_STATUSES} ariaLabel="Status" />
        </Property>
        <Property layout="stacked" label="Assignee">
          <Select value={lead} onChange={setLead} options={PEOPLE} ariaLabel="Assignee" />
        </Property>
        <Property layout="stacked" label="Progress">
          <div className="flex flex-col gap-2">
            <ProgressBar value={10} max={14} label="Issues done" />
            <span className="text-body-2 tabular-nums text-text-secondary">10 of 14 done</span>
          </div>
        </Property>
        <Property layout="stacked" label="Folder">
          <div className="flex flex-col items-start gap-2">
            <span className="break-all font-mono text-body-2 text-text-secondary">5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34</span>
            <Button variant="outlined">Copy Folder link</Button>
            <Button variant="outlined">Pair with another Folder…</Button>
          </div>
        </Property>
        <Divider className="mx-0" />
        <div className="flex flex-col items-start gap-1">
          <Button variant="muted">Archive project</Button>
          <Button variant="destructive">Delete project</Button>
        </div>
      </>
    )
  },
}

/**
 * The issue page's rail, as production: Status, Assignee, Project; then who
 * opened it and when, and the one action Peek needs.
 */
export const IssueRail: Story = {
  render: () => {
    const [status, setStatus] = useState('todo')
    const [assignee, setAssignee] = useState('')
    const [project, setProject] = useState('des')
    return (
      <>
        <Property layout="stacked" label="Status">
          <Select value={status} onChange={setStatus} options={ISSUE_STATUSES} ariaLabel="Status" />
        </Property>
        <Property layout="stacked" label="Assignee">
          <Select value={assignee} onChange={setAssignee} options={PEOPLE} ariaLabel="Assignee" />
        </Property>
        <Property layout="stacked" label="Project">
          <Select value={project} onChange={setProject} options={PROJECTS} ariaLabel="Project" />
        </Property>
        <Divider className="mx-0" />
        <span className="flex items-center gap-1.5 text-body-2 text-text-muted">
          Opened by
          <Person name="Ana Duarte" size={16} className="text-text-secondary" />
          · 10h ago
        </span>
        <Button variant="outlined" className="self-start">
          Copy reference for Peek
        </Button>
      </>
    )
  },
}

/** Read-only values in Peek's row layout, for comparison. */
export const RowValues: Story = {
  render: () => (
    <>
      <Property label="Status">
        <span className="flex items-center gap-1.5 text-body-2 text-text-primary">
          <StatusIcon value="in_progress" />
          In Progress
        </span>
      </Property>
      <Property label="Lead">
        <Person name="Ana Duarte" className="text-body-2 text-text-primary" />
      </Property>
      <Property label="Lead">
        <span className="text-body-2 text-text-muted">—</span>
      </Property>
    </>
  ),
}
