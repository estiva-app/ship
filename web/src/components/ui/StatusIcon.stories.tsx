import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusIcon } from './StatusIcon'

const meta = {
  title: 'Primitives/StatusIcon',
  component: StatusIcon,
  args: { value: 'todo' },
} satisfies Meta<typeof StatusIcon>

export default meta
type Story = StoryObj<typeof meta>

const ROW = (size: 16 | 14) => (
  <div className="flex items-center gap-4 text-body-2 text-text-primary">
    {['todo', 'in_progress', 'done', 'cancelled', 'blocked'].map((value) => (
      <span key={value} className="flex items-center gap-1.5">
        <StatusIcon value={value} size={size} />
        {value}
      </span>
    ))}
  </div>
)

/** The four the vocabulary knows, and one it does not — shown raw, as a plain circle. */
export const Issues: Story = { render: () => ROW(16) }

/** 14px on small controls (a card's status line). */
export const Small: Story = { render: () => ROW(14) }

/** Projects share the shapes: planned = todo, completed = done. */
export const Projects: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-body-2 text-text-primary">
      {['planned', 'in_progress', 'completed', 'cancelled'].map((value) => (
        <span key={value} className="flex items-center gap-1.5">
          <StatusIcon value={value} />
          {value}
        </span>
      ))}
    </div>
  ),
}
