import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconCircleCheck, IconCircleDashed } from '@tabler/icons-react'
import { fn } from 'storybook/test'
import { Divider } from './Divider'
import { Menu, MenuItem, MenuSection } from './Menu'

const meta = {
  title: 'Primitives/Menu',
  component: Menu,
  args: { onClose: fn() },
  decorators: [
    (Story) => (
      <div className="relative h-72 w-96">
        <div className="absolute right-0 top-0 h-8 w-24 rounded-md bg-bg-hover" />
        <div className="absolute right-0 top-0 h-8">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

/** Peek's TopicMoreMenu shape: three plain items, the last destructive. */
export const Plain: Story = {
  args: {
    children: (
      <>
        <MenuItem label="Topic details" onClick={fn()} />
        <MenuItem label="Add to Open work" onClick={fn()} />
        <MenuItem label="Delete topic" destructive onClick={fn()} />
      </>
    ),
  },
}

/** Peek's ConversationMoreMenu shape: a heading, icons, a shortcut, a divider. */
export const WithSections: Story = {
  args: {
    className: 'w-[244px]',
    children: (
      <>
        <MenuSection label="Utilities">
          <MenuItem icon={<IconCircleDashed size={16} stroke={1.5} className="text-text-secondary" />} label="Start topic" onClick={fn()} />
          <MenuItem icon={<IconCircleCheck size={16} stroke={1.5} className="text-text-secondary" />} label="Resolve" shortcut="→" onClick={fn()} />
        </MenuSection>
        <Divider className="mx-0 my-2" />
        <MenuItem label="View details" onClick={fn()} />
        <MenuItem label="Delete" destructive onClick={fn()} />
      </>
    ),
  },
}
