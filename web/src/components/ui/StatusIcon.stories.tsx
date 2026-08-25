import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusIcon } from './StatusIcon'

/**
 * Labels are the vocabulary's, exactly as production prints them
 * (`src/kinds.ts` — "Todo", "In Progress", "Done", "Cancelled"; projects
 * "Planned" … "Completed"). A status the vocabulary does not know is shown
 * raw, as production does.
 */
const meta = {
  title: 'Primitives/StatusIcon',
  component: StatusIcon,
  args: { value: 'todo' },
} satisfies Meta<typeof StatusIcon>

export default meta
type Story = StoryObj<typeof meta>

const ISSUES: [string, string][] = [
  ['todo', 'Todo'],
  ['in_progress', 'In Progress'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
  ['blocked', 'blocked'],
]

const PROJECTS: [string, string][] = [
  ['planned', 'Planned'],
  ['in_progress', 'In Progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
]

const Row = ({ entries, size }: { entries: [string, string][]; size: 16 | 14 }) => (
  <div className={size === 16 ? 'flex items-center gap-5 text-body-2 text-text-primary' : 'flex items-center gap-5 text-caption text-text-muted'}>
    {entries.map(([value, label]) => (
      <span key={value} className="flex items-center gap-1.5">
        <StatusIcon value={value} size={size} />
        {label}
      </span>
    ))}
  </div>
)

/** The four the vocabulary knows, and one it does not — shown raw, as a plain circle. */
export const Issues: Story = { render: () => <Row entries={ISSUES} size={16} /> }

/** 14px on small controls, in a card's status line. */
export const Small: Story = { render: () => <Row entries={ISSUES} size={14} /> }

/** Projects share the shapes: planned = todo, completed = done. */
export const Projects: Story = { render: () => <Row entries={PROJECTS} size={16} /> }
