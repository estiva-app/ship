import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Divider } from './Divider'
import { Menu, MenuItem, MenuSection } from './Menu'

/**
 * The menu SHELL, and only the shell: container, rows, a section heading, a
 * divider, the two exits. What a menu says is each caller's business — the
 * identity menu is the real one in this app (Navigation/IdentityMenu). Item
 * icons and destructive rows are props the shell supports for Peek's sake and
 * are not shown here (Katerina, 2026-08-26: "we need only the menu shell").
 */
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

/** Three plain rows under a trigger. */
export const Plain: Story = {
  args: {
    children: (
      <>
        <MenuItem label="First action" onClick={fn()} />
        <MenuItem label="Second action" onClick={fn()} />
        <MenuItem label="Third action" onClick={fn()} />
      </>
    ),
  },
}

/** A section heading, a divider, then rows — the identity menu's bones. */
export const WithSections: Story = {
  args: {
    className: 'w-[244px]',
    children: (
      <>
        <MenuSection label="Section">
          <MenuItem label="First action" onClick={fn()} />
          <MenuItem label="Second action" onClick={fn()} />
        </MenuSection>
        <Divider className="mx-0 my-2" />
        <MenuItem label="Third action" onClick={fn()} />
      </>
    ),
  },
}
