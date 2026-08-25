import type { Meta, StoryObj } from '@storybook/react-vite'
import { Divider } from './Divider'

/** Peek's Divider, verbatim: a hairline in `border-subtle`, inset 12px each side. `@estiva/ui` candidate. */
const meta = {
  title: 'Primitives/Divider',
  component: Divider,
} satisfies Meta<typeof Divider>

export default meta
type Story = StoryObj<typeof meta>

/** Between two blocks on the surface. */
export const Default: Story = {
  render: () => (
    <div className="w-72 rounded-lg border border-border-default bg-bg-surface py-3 text-body-2 text-text-primary">
      <div className="px-3">Above</div>
      <Divider className="my-2" />
      <div className="px-3">Below</div>
    </div>
  ),
}

/** Inside a menu — on the elevated surface, full width (`mx-0`), as the identity menu uses it. */
export const InAMenu: Story = {
  render: () => (
    <div className="w-72 rounded-lg border border-border-default bg-bg-elevated p-2 text-body-2 text-text-primary shadow-lg">
      <div className="px-2 py-1.5">First action</div>
      <Divider className="mx-0 my-2" />
      <div className="px-2 py-1.5">Second action</div>
    </div>
  ),
}
