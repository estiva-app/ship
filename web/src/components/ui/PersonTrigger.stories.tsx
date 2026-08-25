import type { Meta, StoryObj } from '@storybook/react-vite'
import { Person } from './Person'
import { PersonTrigger } from './PersonTrigger'

const meta = {
  title: 'Primitives/PersonTrigger',
  component: PersonTrigger,
  args: { name: 'Ana Duarte', fallback: 'Anonymous' },
} satisfies Meta<typeof PersonTrigger>

export default meta
type Story = StoryObj<typeof meta>

export const Named: Story = {}

/** Holds its hover fill while what it opens is open. */
export const Open: Story = { args: { open: true } }

/** No profile: silhouette and the fallback word. */
export const Anonymous: Story = { args: { name: undefined } }

/**
 * The `Person` underneath it — a face beside a name, not clickable — at every
 * size the app uses, each with the text it is set in. The face and the words
 * are always chosen together; this is the sheet to choose from.
 */
export const PersonAlone: Story = {
  render: () => (
    <div className="flex flex-col gap-4 text-text-primary">
      {(
        [
          ['16 · a card’s "by" line', 16, 'text-caption text-text-secondary'],
          ['20 · an issue row', 20, 'text-body-2'],
          ['22 · the top bar trigger', 22, 'text-body-2'],
          ['28 · the identity menu', 28, 'text-body-2-strong'],
          ['36 · a detail page', 36, 'text-h4'],
        ] as const
      ).map(([label, size, cls]) => (
        <div key={size} className="flex items-center gap-6">
          <span className="w-44 shrink-0 text-caption text-text-muted">{label}</span>
          <Person name="Ana Duarte" size={size} className={cls} />
          <Person size={size} className={cls} />
          <Person fallback="Anonymous" size={size} className={cls} />
        </div>
      ))}
    </div>
  ),
}
