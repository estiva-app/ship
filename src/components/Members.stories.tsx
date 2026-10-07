import type { Meta, StoryObj } from '@storybook/react-vite'
import { Members } from './Members'

const ME = 'c'.repeat(64)
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)

const meta = {
  title: 'Projects/Members',
  component: Members,
  args: {
    members: new Map([[ME, {}], [ANA, {}]]),
    me: ME,
    people: [{ value: ANA, name: 'Ana Duarte' }, { value: RAVI, name: 'Ravi Mehta' }, { value: ME, name: 'Miky' }],
    nameOf: (pubkey: string) => pubkey.slice(0, 8),
    pictureOf: () => undefined,
    roles: [{ pubkey: ANA, role: 'Author' }],
    onSetMine: async () => true,
    onAdd: async () => true,
  },
} satisfies Meta<typeof Members>

export default meta
type Story = StoryObj<typeof meta>

/** A member: the pill counts two; it opens Members with Leave and Add members. */
export const Member: Story = {}

/** Not a member yet: the dialog offers Join, and nothing to add. */
export const NotAMember: Story = { args: { members: new Map([[ANA, {}]]) } }

/** The assignee left: still listed, "Assignee · not following", and offered again under Add members. */
export const AssigneeLeft: Story = { args: { roles: [{ pubkey: ANA, role: 'Author' }, { pubkey: RAVI, role: 'Assignee' }] } }

/** On a project: the line saying leaving it leaves its issues as they are. */
export const OnAProject: Story = { args: { note: 'Your issues here still notify you.' } }

/** Where membership cannot change: the list, and no Join, Leave or Add. */
export const ReadOnly: Story = { args: { readOnlyReason: 'Signed out' } }

/** Before the first membership read: nothing at all, rather than a wrong count. */
export const Loading: Story = { args: { members: undefined } }
