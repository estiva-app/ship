import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ANA, MARA, RAVI } from '@/fixtures/issues'
import { TeamView, type TeamInitiativeRow } from './TeamView'

/**
 * The team page as Peek draws its own (D6), on the same invented team as `Views/FolderView`'s Three apps, so the two
 * stories are its before and after: "Onboarding" holds one initiative, one project, one issue filed in it directly, and
 * one file of an app nobody wrote, which Ship counts and does not list.
 */
const NOW = Date.now()
const FACES = { a: ANA, r: RAVI, m: MARA }
const faceOf = (key: string) => FACES[key as keyof typeof FACES] ?? { name: '—' }

const INITIATIVES: TeamInitiativeRow[] = [
  { address: '30840:a:onboarding', title: 'Onboarding', summary: 'Everything a new team member needs in their first week.', href: '#', members: 5, people: ['a', 'r', 'm'], active: Math.floor(NOW / 1000) - 2 * 86400 },
]

const meta = {
  title: 'Views/TeamView',
  component: TeamView,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'Onboarding',
    members: { faces: [ANA, RAVI, MARA], count: 6 },
    initiatives: INITIATIVES,
    projects: [{ address: '30850:a:p', title: 'Payment integration', href: '#' }],
    issues: [{ address: '30851:a:i', title: 'Refund webhook retries', href: '#' }],
    others: 1,
    faceOf,
    now: NOW,
  },
  decorators: [(Story) => <div className="flex h-screen flex-col bg-bg-base">{Story()}</div>],
} satisfies Meta<typeof TeamView>

export default meta
type Story = StoryObj<typeof meta>

/** The after of `Views/FolderView` › Three apps: its initiative, its project and its issue listed; the other app's file counted. */
export const Default: Story = {}

/** An owner or admin: the ⋮ holds Rename… and Archive team…, where the old page had the editable title and a button. */
export const ForAnOwner: Story = { args: { onRename: fn(), onArchive: fn() } }

/**
 * Option for the rows (her 18 Nov question, "what do they show today?"): the facts Ship's own lists show — a project's
 * status, lead and progress (the Projects list), an issue's status, assignee and last change (the Issues list).
 */
export const RowsWithTheirFacts: Story = {
  args: {
    onRename: fn(),
    onArchive: fn(),
    projects: [
      { address: '30850:a:p', title: 'Payment integration', href: '#', status: { value: 'in_progress', label: 'In Progress' }, person: ANA, progress: { done: 4, total: 9 } },
      { address: '30850:a:q', title: 'Welcome emails', href: '#', status: { value: 'planned', label: 'Planned' }, progress: { done: 0, total: 3 } },
    ],
    issues: [{ address: '30851:a:i', title: 'Refund webhook retries', href: '#', status: { value: 'in_progress', label: 'In Progress' }, person: RAVI, at: Math.floor(NOW / 1000) - 3 * 3600 }],
  },
}

/** Its initiatives still being read: the heading, and a skeleton in their place. */
export const InitiativesLoading: Story = { args: { initiatives: 'loading' } }

/** Its initiatives did not load: said in words, with Try again. */
export const InitiativesFailed: Story = { args: { initiatives: 'failed', onRetryInitiatives: fn() } }

/** Nothing in it at all. */
export const Empty: Story = { args: { initiatives: [], projects: [], issues: [], others: 0 } }
