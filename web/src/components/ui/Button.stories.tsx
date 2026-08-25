import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconPlus } from '@tabler/icons-react'
import { Button } from './Button'

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Add project', variant: 'muted', size: 'default' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary' } }
export const Outlined: Story = { args: { variant: 'outlined' } }
export const Muted: Story = {}

/** The leading icon takes 16px on the default size, 14px on small. */
export const WithLeadingIcon: Story = {
  args: { variant: 'outlined', leadingIcon: <IconPlus size={16} stroke={1.5} /> },
}

export const Small: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Button {...args} size="small" variant="primary" />
      <Button {...args} size="small" variant="outlined" />
      <Button {...args} size="small" />
      <Button {...args} size="small" variant="outlined" leadingIcon={<IconPlus size={14} stroke={1.5} />} />
    </div>
  ),
}

/** Disabled is drawn only where a control is momentarily unavailable — a
 *  control someone may not use at all is absent, not disabled. */
export const Disabled: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Button {...args} disabled variant="primary" />
      <Button {...args} disabled variant="outlined" />
      <Button {...args} disabled />
    </div>
  ),
}
