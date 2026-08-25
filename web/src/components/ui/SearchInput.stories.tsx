import type { Meta, StoryObj } from '@storybook/react-vite'
import { SearchInput } from './SearchInput'

const meta = {
  title: 'Primitives/SearchInput',
  component: SearchInput,
  args: { placeholder: 'Search Ship…', className: 'w-[290px]' },
} satisfies Meta<typeof SearchInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** With the keyboard hint Peek's top bar shows. */
export const WithShortcut: Story = { args: { shortcut: '⌘ K' } }
