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
export const Named: Story = { args: { name: 'Jan Mikula' } }

/** One word, its first two letters. */
export const OneWord: Story = { args: { name: 'Katerina' } }

/** No profile at all: the silhouette. There is no way to hand this a key. */
export const Anonymous: Story = {}

/** A picture on top of the initials — if the URL fails, the initials show. */
export const WithPicture: Story = {
  args: {
    name: 'Jan Mikula',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="%2346c08a"/></svg>',
  },
}

/** A broken picture URL reveals the initials, not a hole. */
export const BrokenPicture: Story = {
  args: { name: 'Jan Mikula', src: 'http://localhost:1/nothing-here.png' },
}

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <Avatar {...args} size={20} />
      <Avatar {...args} size={22} />
      <Avatar {...args} size={28} />
      <Avatar {...args} size={36} />
      <Avatar size={20} />
      <Avatar size={22} />
      <Avatar size={28} />
      <Avatar size={36} />
    </div>
  ),
  args: { name: 'Jan Mikula' },
}
