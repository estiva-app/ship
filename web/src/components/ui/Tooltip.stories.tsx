import type { Meta, StoryObj } from '@storybook/react-vite'
import { Tooltip, WithTooltip } from './Tooltip'

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  args: { label: '18 open' },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

/** The pill itself, as Peek draws it. */
export const Static: Story = {}

/** Hover the number. Portal-positioned above the trigger, clamped to the viewport. */
export const OnHover: Story = {
  render: (args) => (
    <WithTooltip label={args.label}>
      <span className="cursor-default text-caption tabular-nums text-text-muted">18</span>
    </WithTooltip>
  ),
}
