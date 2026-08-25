import type { Meta, StoryObj } from '@storybook/react-vite'
import { Chip } from './Chip'

const meta = {
  title: 'Primitives/Chip',
  component: Chip,
  args: { label: 'Archived' },
} satisfies Meta<typeof Chip>

export default meta
type Story = StoryObj<typeof meta>

/** The one Ship uses today: "Archived" on a project. */
export const Neutral: Story = {}

export const AllTypes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Chip label="Neutral" />
      <Chip type="brand" label="Brand" />
      <Chip type="info" label="Info" />
      <Chip type="warning" label="Warning" />
      <Chip type="success" label="Success" />
      <Chip type="error" label="Error" />
    </div>
  ),
}
