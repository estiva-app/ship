import type { Meta, StoryObj } from '@storybook/react-vite'
import { Banner } from './Banner'

const meta = {
  title: 'Feedback/Banner',
  component: Banner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Banner>

export default meta
type Story = StoryObj<typeof meta>

export const Ok: Story = { args: { tone: 'ok', children: 'Public key copied.' } }

export const Error: Story = {
  args: { tone: 'error', children: 'Could not reach the relay at http://localhost:3000 — showing what was last read.' },
}
