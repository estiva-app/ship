import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { ShipSidebar, type SidebarEntry } from '@/components/ShipSidebar'
import { SIDEBAR_PROJECTS } from '@/fixtures/projects'

import { InitiativePage, IssuePage, ItemPage, ProjectPage, TeamPage } from './Pages'
import { INITIATIVES } from './lens'
import { DecisionFollowUps, LoopPage } from './Agents'
import { HAND_TYPED, ITEMS, PERSONAL } from './fixtures'

/**
 * CONCEPT — Insights, Journal and Risks in Ship (prototype issue 009bc509). Drawn on today's shell and pages; the
 * Read me lists what changed from today and what is new here.
 */
// Topics are Initiatives here (Miky, 18 Nov), each folding to its projects; one project is in both.
const SIDEBAR_INITIATIVES = INITIATIVES.map((n) => ({
  id: n.id,
  title: n.title,
  href: `#/initiative/${n.id}`,
  work: n.projects.map((p) => ({ id: `${n.id}-${p}`, kind: 'project' as const, title: p, href: '#' })),
}))

function Shell({ current = 'projects', initiative, children }: { current?: SidebarEntry; initiative?: string; children: React.ReactNode }) {
  return (
    <div className="h-screen">
      <AppShell
        logo="Estiva Ship"
        identity={<IdentityMenu me={{ name: 'Miky' }} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={<ShipSidebar openIssues={18} activeProjects={SIDEBAR_PROJECTS.length} hrefFor={(entry) => `#/${entry}`} current={{ entry: current }} topics={SIDEBAR_INITIATIVES} naming="initiatives" openTopic={initiative} onRetryTopics={fn()} />}
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
/** Issues as the plan of the build (Miky, 17 Nov): To triage as boxes; one two-line table per milestone, the one being built now raised, each issue's Claude Code session in its row (Open session, or Start session); Later and Not doing as two tabs last. Real data: "Topics: level up the topic experience" as on 9 Nov; the two sessions are imagined. */
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
/** Miky, 24 Nov, after Notion's "A new shape for work": an agent claims an issue, works, and writes back where people read. */
export const IssueClaimedWorking: Story = { render: () => <Shell current="issues"><IssuePage claim="working" /></Shell> }
export const IssueClaimedWroteBack: Story = { render: () => <Shell current="issues"><IssuePage claim="wrote" /></Shell> }
/** Once nothing waits on you, the box shrinks to one line of the issue's history; the session stays on AI sessions. */
export const IssueSessionDone: Story = { render: () => <Shell current="issues"><IssuePage claim="done" /></Shell> }
/** Every agent run on the project, a person's Claude session and a loop's alike; a loop's page opens from its row. */
export const ProjectAiSessions: Story = { render: () => <Shell><ProjectPage start="sessions" /></Shell> }
/** An accepted Decision lists what still says otherwise, each with the change the decision loop proposes. */
export const ItemDecisionFollowUps: Story = { render: () => <Shell><ItemPage item={item('j2')} below={<DecisionFollowUps />} /></Shell> }
/** A loop's own page: what it reads, the level a person allows, its instructions with versions, its checks and runs. */
export const DecisionLoopPage: Story = { render: () => <Shell><LoopPage /></Shell> }
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
/** A dreaming loop changed an Accepted item (Miky, 19 Nov): it says who, what and why, and whoever added it can undo it. */
export const ItemChangedByLoop: Story = {
  render: () => (
    <Shell>
      <ItemPage item={{ ...item('i4'), changed: { by: 'The dreaming loop', what: 'merged “Search finds only word starts” into it', why: 'Both say how search matches words', ago: '2h ago' } }} />
    </Shell>
  ),
}

export const ItemTypedByHand: Story ={ render: () => <Shell><ItemPage item={HAND_TYPED} /></Shell> }
/** Personal memory: only Miky and his own Claude read it (record a-loop-reads-only-shared-memory-…). */
export const ItemPersonal: Story = { render: () => <Shell><ItemPage item={PERSONAL} /></Shell> }
/** Two sources, one in a direct message: only the two of them read it, and the line says which source narrowed it. */
export const ProjectInsightTwoSources: Story = { render: () => <Shell><ProjectPage start="insights" open="i1" /></Shell> }
/** An accepted Question whose only source was deleted: it stays, and the project's loop proposes Outdated. */
export const ProjectQuestionNoSourceLeft: Story = { render: () => <Shell><ProjectPage start="risks" open="r3" /></Shell> }
/** Seen from the team: the issue it is about shows as its card, and Change files it by hand. */
export const TeamInsightAboutAnIssue: Story = { render: () => <Shell current="projects"><TeamPage start="insights" open="i1" /></Shell> }
/** The alternative in tabs (Miky, 27 Nov: "lots of section"): item and Properties in view; Context, Comments, Used, History one at a time. */
export const TabsTeamInsightAboutAnIssue: Story = { render: () => <Shell current="projects"><TeamPage start="insights" open="i1" panel="tabs" /></Shell> }
export const TabsProjectInsightOpen: Story = { render: () => <Shell><ProjectPage start="insights" open="i3" panel="tabs" /></Shell> }
export const TabsProjectQuestionNoSourceLeft: Story = { render: () => <Shell><ProjectPage start="risks" open="r3" panel="tabs" /></Shell> }
/** A replaced Decision: "Replaced by" links the entry that replaced it, and its history can undo it. */
export const ProjectDecisionReplacedOpen: Story = { render: () => <Shell><ProjectPage start="journal" open="j6" /></Shell> }
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
/** The team page's Risks & questions: each item says where it lives, the team's own included. */
export const TeamRisks: Story = { render: () => <Shell current="projects"><TeamPage start="risks" /></Shell> }

/** An Initiative (today's topic, renamed): its projects. */
export const InitiativeProjects: Story = { render: () => <Shell initiative="ini1"><InitiativePage id="ini1" start="projects" /></Shell> }
/** An Initiative's Insights: every item about its projects and their issues, each saying where it lives. */
export const InitiativeInsights: Story = { render: () => <Shell initiative="ini1"><InitiativePage id="ini1" start="insights" /></Shell> }
/** An Initiative's Journal, with a Decision about the Initiative itself. */
export const InitiativeJournal: Story = { render: () => <Shell initiative="ini1"><InitiativePage id="ini1" start="journal" /></Shell> }
/** An Initiative's Risks & questions. */
export const InitiativeRisks: Story = { render: () => <Shell initiative="ini1"><InitiativePage id="ini1" start="risks" /></Shell> }
/** A second Initiative listing one of the same projects: the same items show here too, since an Initiative is a lens. */
export const SecondInitiativeInsights: Story = { render: () => <Shell initiative="ini2"><InitiativePage id="ini2" start="insights" /></Shell> }
