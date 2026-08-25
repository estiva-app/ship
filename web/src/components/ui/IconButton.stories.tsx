import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconDots, IconPencil, IconX } from '@tabler/icons-react'
import { IconButton } from './IconButton'

/** Peek's IconButton. An icon-only button always has an accessible name. */
const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  args: { 'aria-label': 'More', tooltip: 'More', children: <IconDots size={16} stroke={1.5} /> },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

export const Muted: Story = {}
export const Outlined: Story = { args: { variant: 'outlined' } }
export const Primary: Story = { args: { variant: 'primary' } }

/** Disabled, per variant. */
export const Disabled: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <IconButton {...args} disabled />
      <IconButton {...args} variant="outlined" disabled />
      <IconButton {...args} variant="primary" disabled />
    </div>
  ),
}

/** Where Ship will use them: edit, close, more. */
export const InUse: Story = {
  render: () => (
    <div className="flex items-center gap-1">
      <IconButton aria-label="Edit" tooltip="Edit">
        <IconPencil size={16} stroke={1.5} />
      </IconButton>
      <IconButton aria-label="More" tooltip="More">
        <IconDots size={16} stroke={1.5} />
      </IconButton>
      <IconButton aria-label="Close" tooltip="Close">
        <IconX size={16} stroke={1.5} />
      </IconButton>
    </div>
  ),
}
