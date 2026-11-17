import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar, type SidebarEntry } from '@/components/ShipSidebar'
import { SIDEBAR_PROJECTS } from '@/fixtures/projects'
import { ANA } from '@/fixtures/issues'
import { IssuePage, ItemPage, ProjectPage, TeamPage } from './Pages'
import { HAND_TYPED, ITEMS } from './fixtures'

/**
 * CONCEPT — Insights, Journal and Risks in Ship (prototype issue 009bc509). Drawn on today's shell and pages; the
 * Read me lists what changed from today and what is new here.
 */
function Shell({ current = 'projects', children }: { current?: SidebarEntry; children: React.ReactNode }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={ANA} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<ShipSidebar openIssues={18} activeProjects={SIDEBAR_PROJECTS.length} hrefFor={(entry) => `#/${entry}`} current={{ entry: current }} topics={[]} onRetryTopics={fn()} />}
      >
        {children}
      </AppShell>
    </div>
  )
}

const meta = {
  title: 'Concept/Insights, Journal and Risks',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const item = (id: string) => ITEMS.find((i) => i.id === id)!

/** Overview: Needs you above the document (the blocker waiting on you, the question for you to decide, what waits for you to accept), then one line of what is new. A marked paragraph (amber line, an Insight) beside one changed since your last visit (grey, dashed). A block's ⋯ has Mark as… */
export const ProjectOverview: Story = { render: () => <Shell><ProjectPage start="overview" /></Shell> }
/** Overview with the side Overview open beside it (Activity, History, Related) — to compare with What's new. */
export const ProjectOverviewWithSidePanel: Story = { render: () => <Shell><ProjectPage start="overview" side="overview" /></Shell> }
/** Issues as the build's dashboard (Miky, 17 Nov): Being built, each with its Claude Code session; Next, today's table; Later to triage: Needed, Move to…, Not relevant. */
export const ProjectIssues: Story = { render: () => <Shell><ProjectPage start="issues" /></Shell> }
/** Insights: a grid of boxes, filtered by category; new ones first with a dot, Accept / ✕ on them. */
export const ProjectInsights: Story = { render: () => <Shell><ProjectPage start="insights" /></Shell> }
/** An Insight opened beside the list, as Peek opens a thread: the list stays in view. */
export const ProjectInsightOpen: Story = { render: () => <Shell><ProjectPage start="insights" open="i3" /></Shell> }
/** Journal: the timeline, a blue dot after each new title, summaries, an Update read whole; Katerina's Decision waits for her. */
export const ProjectJournal: Story = { render: () => <Shell><ProjectPage start="journal" /></Shell> }
/** A Journal entry opened beside the timeline. */
export const ProjectJournalEntryOpen: Story = { render: () => <Shell><ProjectPage start="journal" open="j1" /></Shell> }
/** Each kind opened beside its list, drawn as its list draws it (Miky, 16 Nov: the details felt out of touch). */
export const ProjectToolInsightOpen: Story = { render: () => <Shell><ProjectPage start="insights" open="i9" /></Shell> }
export const ProjectJournalUpdateOpen: Story = { render: () => <Shell><ProjectPage start="journal" open="j0" /></Shell> }
export const ProjectQuestionOpen: Story = { render: () => <Shell><ProjectPage start="risks" open="r3" /></Shell> }
export const ProjectBlockerOpen: Story = { render: () => <Shell><ProjectPage start="risks" open="r6" /></Shell> }
/** Overview: the marked paragraph's label in the right margin opens its Insight beside the page. */
export const ProjectOverviewMarkOpen: Story = { render: () => <Shell><ProjectPage start="overview" open="i1" /></Shell> }
/** Journal, seen by Katerina: the Decision in her name shows Accept / ✕ to her. */
export const ProjectJournalAsKaterina: Story = { render: () => <Shell><ProjectPage start="journal" me="katerina" /></Shell> }
/** Open & Risks: a dashboard of Blockers, Open questions and Concerns, each with its own +, "None" when empty. */
export const ProjectRisks: Story = { render: () => <Shell><ProjectPage start="risks" /></Shell> }
/** Decide on an open question: pick an option, the one leant towards already picked, and say why if you want. Press Decide to see what follows. */
export const ProjectQuestionDecide: Story = { render: () => <Shell><ProjectPage start="risks" deciding="r9" /></Shell> }
/** After Decide: the Decision at the top of the Journal with what was chosen and not, its question resolved. */
export const ProjectQuestionDecided: Story = { render: () => <Shell><ProjectPage start="journal" decided="r9" open="d-r9" /></Shell> }
/** A list loading. */
export const ProjectInsightsLoading: Story = { render: () => <Shell><ProjectPage start="insights" listState="loading" /></Shell> }
/** A list that failed to load. */
export const ProjectRisksError: Story = { render: () => <Shell><ProjectPage start="risks" listState="error" /></Shell> }
/** An empty Journal: what to do to fill it. */
export const ProjectJournalEmpty: Story = { render: () => <Shell><ProjectPage start="journal" listState="empty" /></Shell> }
/** A project's comments with Mark as… in each comment's ⋯; one already marked as a Concern. */
export const ProjectComments: Story = { render: () => <Shell><ProjectPage start="overview" side="comments" /></Shell> }

/** An issue: the items about it under the description; Katerina's comment marked as a Decision in her name (blue line). Mark as… in each comment's and each block's ⋯. */
export const Issue: Story = { render: () => <Shell current="issues"><IssuePage /></Shell> }
/** An issue whose comment's Decision was Rejected: no line on the comment any more. */
export const IssueMarkRejected: Story = { render: () => <Shell current="issues"><IssuePage commentMark={false} itemsState="empty" /></Shell> }
/** An issue's items loading. */
export const IssueItemsLoading: Story = { render: () => <Shell current="issues"><IssuePage itemsState="loading" /></Shell> }

/** An Insight's page, Proposed, from Katerina's message in Peek (Miky marked it for her). */
export const ItemInsightProposed: Story = { render: () => <Shell><ItemPage item={item('i1')} /></Shell> }
/** An Insight, Accepted, whose message was edited since it was marked: "Edited since marked — show it now". */
export const ItemInsightEditedSinceMarked: Story = { render: () => <Shell><ItemPage item={item('i3')} /></Shell> }
/** An Insight, Outdated. */
export const ItemInsightOutdated: Story = { render: () => <Shell><ItemPage item={item('i5')} /></Shell> }
/** A Decision Miky wrote in Katerina's name: "Decided by Katerina", waiting for her yes. */
export const ItemDecisionWaitingForDecider: Story = { render: () => <Shell><ItemPage item={item('j1')} /></Shell> }
/** The same Decision as Katerina sees it: she can say yes, no, or change who decided. */
export const ItemDecisionAsDecider: Story = { render: () => <Shell><ItemPage item={item('j1')} me="katerina" /></Shell> }
/** A Decision, Superseded. */
export const ItemDecisionSuperseded: Story = { render: () => <Shell><ItemPage item={item('j6')} /></Shell> }
/** A Risk, Open, whose source block was deleted: the page says so and keeps its own title. */
export const ItemRiskSourceDeleted: Story = { render: () => <Shell><ItemPage item={item('r3')} /></Shell> }
/** A Risk, Resolved. */
export const ItemRiskResolved: Story = { render: () => <Shell><ItemPage item={item('r4')} /></Shell> }
/** A Risk, Rejected. */
export const ItemRiskRejected: Story = { render: () => <Shell><ItemPage item={item('r5')} /></Shell> }
/** A Risk typed by hand, with no source. */
export const ItemTypedByHand: Story = { render: () => <Shell><ItemPage item={HAND_TYPED} /></Shell> }
/** An item's page loading. */
export const ItemLoading: Story = { render: () => <Shell><ItemPage item={item('i1')} state="loading" /></Shell> }
/** An item's page that failed to load. */
export const ItemError: Story = { render: () => <Shell><ItemPage item={item('i1')} state="error" /></Shell> }
/** An item in a team you are not in. */
export const ItemNoAccess: Story = { render: () => <Shell><ItemPage item={item('i1')} state="no-access" /></Shell> }

/** The team page: the team's own Insights, Journal and Risks beside its Projects. */
export const TeamInsights: Story = { render: () => <Shell current="projects"><TeamPage start="insights" /></Shell> }
/** The team page's Journal. */
export const TeamJournal: Story = { render: () => <Shell current="projects"><TeamPage start="journal" /></Shell> }
