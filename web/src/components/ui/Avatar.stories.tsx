import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = {
  title: 'Primitives/Avatar',
  component: Avatar,
  args: { size: 22 },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

/** Two words, two letters. */
export const Named: Story = { args: { name: 'Ana Duarte' } }

/** One word, its first two letters. */
export const OneWord: Story = { args: { name: 'Ravi' } }

/** No profile at all: the silhouette. There is no way to hand this a key. */
export const Anonymous: Story = {}

/** A picture on top of the initials — if the URL fails, the initials show. */
export const WithPicture: Story = {
  args: {
    name: 'Ana Duarte',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="%2346c08a"/></svg>',
  },
}

/** A broken picture URL reveals the initials, not a hole. */
export const BrokenPicture: Story = {
  args: { name: 'Ana Duarte', src: 'http://localhost:1/nothing-here.png' },
}

/** Every size the app uses: 16 card meta · 20 row · 22 top bar · 28 menu · 36 detail. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      {[16, 20, 22, 28, 36].map((size) => (
        <Avatar key={size} {...args} size={size} />
      ))}
      {[16, 20, 22, 28, 36].map((size) => (
        <Avatar key={`anon-${size}`} size={size} />
      ))}
    </div>
  ),
  args: { name: 'Ana Duarte' },
}
