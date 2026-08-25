import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusLabel } from './StatusLabel'

const ISSUES: [string, string][] = [
  ['todo', 'Todo'],
  ['in_progress', 'In Progress'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
  ['blocked', 'blocked'],
]

/** A status written out — icon and label, one colour everywhere; two sizes; strong for a heading. */
const meta = {
  title: 'Primitives/StatusLabel',
  component: StatusLabel,
  args: { value: 'in_progress', label: 'In Progress' },
} satisfies Meta<typeof StatusLabel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Small: Story = { args: { size: 'small' } }
export const Strong: Story = { args: { strong: true } }

/** Every status the vocabulary knows, and one it does not, at both sizes. */
export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-5">
        {ISSUES.map(([value, label]) => (
          <StatusLabel key={value} value={value} label={label} />
        ))}
      </div>
      <div className="flex items-center gap-5">
        {ISSUES.map(([value, label]) => (
          <StatusLabel key={value} value={value} label={label} size="small" />
        ))}
      </div>
    </div>
  ),
}
