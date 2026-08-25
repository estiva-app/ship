import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconSearch } from '@tabler/icons-react'
import { fn } from 'storybook/test'
import { IdentityMenu } from './IdentityMenu'
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

/** The search slot, with a stand-in for the field that lands later. */
export const WithSearchSlot: Story = {
  args: {
    search: (
      <div className="flex h-8 w-72 items-center gap-2 rounded-lg border border-border-default bg-bg-inset px-3 text-input-value text-text-muted">
        <IconSearch size={16} stroke={1.5} />
        Search Ship…
      </div>
    ),
  },
}
