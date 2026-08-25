import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { IdentityMenu } from './IdentityMenu'

const meta = {
  title: 'Navigation/IdentityMenu',
  component: IdentityMenu,
  args: {
    me: {},
    signedIn: false,
    relayUrl: 'http://localhost:3000',
    onCopyKey: fn(),
    onSignOut: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex h-[52px] w-[520px] items-center justify-end border-b border-border-default bg-bg-surface pr-[26px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdentityMenu>

export default meta
type Story = StoryObj<typeof meta>

/** A browser-held key: silhouette + "Anonymous". Click to open the menu. */
export const Anonymous: Story = {}

/** Signed in through Estiva ID, in a build that offers sign-in. */
export const SignedIn: Story = {
  args: {
    me: { name: 'Ana Duarte', email: 'ana@example.com' },
    signedIn: true,
    idBase: 'https://id.estiva.app',
  },
}

/** A `kind:0` with a picture. */
export const WithPicture: Story = {
  args: {
    me: {
      name: 'Ravi Mehta',
      picture:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="%236c8cff"/></svg>',
    },
    signedIn: true,
    idBase: 'https://id.estiva.app',
  },
}
