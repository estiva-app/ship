import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconBox } from '@tabler/icons-react'
import { EmptyState } from './EmptyState'

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: { message: 'No projects yet. Create one to get a Folder you can share with Peek.' },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithIcon: Story = { args: { icon: <IconBox size={16} stroke={1.5} />, message: 'Nothing archived.' } }
