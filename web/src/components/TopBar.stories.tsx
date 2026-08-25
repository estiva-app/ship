import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { IdentityMenu } from './IdentityMenu'
import { SearchInput } from './ui/SearchInput'
import { TopBar } from './TopBar'

const meta = {
  title: 'Navigation/TopBar',
  component: TopBar,
  parameters: { layout: 'fullscreen' },
  args: {
    right: <IdentityMenu me={{}} signedIn={false} relayUrl="http://localhost:3000" onCopyKey={fn()} />,
  },
} satisfies Meta<typeof TopBar>

export default meta
type Story = StoryObj<typeof meta>

/** Today: name on the left, nothing in the middle, identity on the right. */
export const Default: Story = {}

/** Peek's SearchInput in the slot, at the width Peek's top bar gives it. */
export const WithSearch: Story = {
  args: {
    search: <SearchInput placeholder="Search Ship…" shortcut="⌘ K" className="w-[290px]" />,
  },
}
