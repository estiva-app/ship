import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProgressBar } from './ProgressBar'

/** The rail's progress: a thin track, a success fill, the words beside it. */
const meta = {
  title: 'Feedback/ProgressBar',
  component: ProgressBar,
  args: { value: 10, max: 14, label: 'Issues done' },
  decorators: [
    (Story) => (
      <div className="w-[346px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** As the rail shows it: the bar, then "10 of 14 done". */
export const WithWords: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <ProgressBar {...args} />
      <span className="text-body-2 tabular-nums text-text-secondary">
        {args.value} of {args.max} done
      </span>
    </div>
  ),
}

export const Empty: Story = { args: { value: 0, max: 14 } }
export const Complete: Story = { args: { value: 14, max: 14 } }
