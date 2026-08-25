import type { Meta, StoryObj } from '@storybook/react-vite'
import { SectionLabel } from './SectionLabel'

/** Peek's SectionLabel: 12/12/500, primary text. Every section heading in the app. `@estiva/ui` candidate. */
const meta = {
  title: 'Primitives/SectionLabel',
  component: SectionLabel,
  args: { children: 'Projects' },
} satisfies Meta<typeof SectionLabel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** In its 32px row, as the sidebar and the menu shell place it. */
export const InARow: Story = {
  render: (args) => (
    <div className="w-60 bg-bg-surface px-2.5">
      <div className="flex h-8 items-center px-2">
        <SectionLabel {...args} />
      </div>
    </div>
  ),
}
