import type { Meta, StoryObj } from '@storybook/react-vite'
import { Person } from './Person'
import { PersonTrigger } from './PersonTrigger'

const meta = {
  title: 'Primitives/PersonTrigger',
  component: PersonTrigger,
  args: { name: 'Katerina Kelepouri', fallback: 'Anonymous' },
} satisfies Meta<typeof PersonTrigger>

export default meta
type Story = StoryObj<typeof meta>

export const Named: Story = {}

/** Holds its hover fill while what it opens is open. */
export const Open: Story = { args: { open: true } }

/** No profile: silhouette and the fallback word. */
export const Anonymous: Story = { args: { name: undefined } }

/** The `Person` underneath it — a face beside a name, not clickable. */
export const PersonAlone: Story = {
  render: () => (
    <div className="flex flex-col gap-3 text-body-2 text-text-primary">
      <Person name="Jan Mikula" />
      <Person name="Jan Mikula" size={28} className="text-body-2-strong" />
      <Person />
      <Person fallback="Anonymous" />
    </div>
  ),
}
