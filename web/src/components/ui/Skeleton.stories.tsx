import type { Meta, StoryObj } from '@storybook/react-vite'
import { SkeletonBar, SkeletonList, SkeletonRow } from './Skeleton'

/**
 * Peek's Skeleton, the generic parts. A group wrapped in `animate-skeleton-in`
 * stays invisible for the first 150ms, so a fast load never flashes one.
 */
const meta = {
  title: 'Feedback/Skeleton',
  component: SkeletonBar,
  args: { className: 'h-3.5 w-40' },
} satisfies Meta<typeof SkeletonBar>

export default meta
type Story = StoryObj<typeof meta>

export const Bar: Story = {}

export const Row: Story = { render: () => <SkeletonRow /> }

/** Eight rows with varied widths, in a 240px rail, after the delay. */
export const List: Story = {
  render: () => (
    <div className="w-60 bg-bg-surface px-2.5 py-3">
      <SkeletonList />
    </div>
  ),
}
