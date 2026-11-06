import { useEffect, useState, type MouseEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { archivedLine, EmptyState } from '@estiva-app/ui'
import type { Imeta } from '@estiva-app/protocol'
import { AppShell } from '@/components/AppShell'
import { IdentityMenu } from '@/components/IdentityMenu'
import { Members } from '@/components/Members'
import type { ThreadData } from '@/components/ConversationThread'
import { ISSUES, ISSUE_STATUSES, hrefFor as issueHref } from '@/fixtures/issues'
import { PROJECT_TABS } from '@/fixtures/projects'
import type { TopicsTab } from '@/lib/topics'
import type { ProjectsTab } from '@/router'
import { IssuesView, type IssuesScope } from '@/views/IssuesView'
import { ProjectsView, type ProjectsLayout } from '@/views/ProjectsView'
import { EXPLORE_HREF, OTHER_THREADS, PEOPLE, TOPICS, TOPIC_THREADS, canOpen, exploreLists, personOf, sidebarTopics, topicPage, type Topic, type Who } from './fixtures'
import { ShipSidebar, type SidebarFolder, type SidebarPlace } from './ShipSidebar'
import { TopicView } from './TopicView'
import { TopicsView } from './TopicsView'

/**
 * PROTOTYPE — Topics: level up the topic experience, in Ship (concept branch only; it never merges). Ship's own
 * frame, sidebar and pages from `origin/main`, fed made-up contents under real topic names; the copies in this folder
 * are the only places that change (each says what changed at its top). Read me: estiva-ui's
 * `Prototype/Topics level-up/Read me`.
 */

type Read = 'ok' | 'loading' | 'failed'
type Place = { type: 'projects' } | { type: 'issues' } | { type: 'explore' } | { type: 'topic'; id: string } | { type: 'file'; id: string }

/** The teams, as Ship's sidebar story has them: a name, no count. */
const FOLDERS: SidebarFolder[] = [
  { id: 'company', name: 'Company' },
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
]

/** Attach without a relay: the picked file, shown from the browser's own memory. */
const pretendUpload = async (file: File) => ({ url: URL.createObjectURL(file), m: file.type || 'application/octet-stream', x: '0'.repeat(64), size: file.size, filename: file.name }) as unknown as Imeta

/** Where a link inside the story goes: Ship's routes, followed in the story instead of the address bar. */
function placeOf(href: string): Place | undefined {
  if (href === EXPLORE_HREF) return { type: 'explore' }
  if (href === '#/projects') return { type: 'projects' }
  if (href === '#/issues') return { type: 'issues' }
  const [, kind, id] = href.match(/^#\/(topic|file)\/([^/]+)$/) ?? []
  if (kind === 'topic') return { type: 'topic', id }
  if (kind === 'file') return { type: 'file', id }
  return undefined
}

const sidebarPlace = (place: Place): SidebarPlace =>
  place.type === 'explore' ? { entry: 'topics' } : place.type === 'projects' || place.type === 'issues' ? { entry: place.type } : place.type === 'topic' ? { topic: place.id } : { file: place.id }

interface ShipAppProps {
  viewer?: Who
  start?: Place
  /** The sidebar's and the Topics page's read of your topics. */
  topicsRead?: Read
  /** The open topic's read. */
  topicRead?: Read
  documentsRead?: Read
  conversationShown?: boolean
  /** You are in no topic at all. */
  none?: boolean
  /** Two seconds in, somebody writes in "Universal Navigation": its place in the sidebar waits for the next open. */
  live?: boolean
  exploreTab?: TopicsTab
  query?: string
}

function ShipApp({ viewer = 'miky', start = { type: 'topic', id: 'widgets' }, topicsRead: firstTopicsRead = 'ok', topicRead: firstTopicRead = 'ok', documentsRead: firstDocumentsRead = 'ok', conversationShown = true, none = false, live = false, exploreTab = 'all', query }: ShipAppProps) {
  const [place, setPlace] = useState<Place>(start)
  const [topics, setTopics] = useState<Topic[]>(() => (none ? TOPICS.map((topic) => ({ ...topic, members: topic.members.filter((who) => who !== viewer) })) : TOPICS))
  const [topicsRead, setTopicsRead] = useState(firstTopicsRead)
  const [topicRead, setTopicRead] = useState(firstTopicRead)
  const [documentsRead, setDocumentsRead] = useState(firstDocumentsRead)
  const [shown, setShown] = useState(conversationShown)
  const [threads, setThreads] = useState<Record<string, ThreadData[]>>({})
  const [tab, setTab] = useState<TopicsTab>(exploreTab)
  const [projectsTab, setProjectsTab] = useState<ProjectsTab>('active')
  const [layout, setLayout] = useState<ProjectsLayout>('table')
  const [scope, setScope] = useState<IssuesScope>('all')
  // The app's own (App.tsx): the button left of "Estiva Ship" folds the sidebar away.
  const [navOpen, setNavOpen] = useState(true)

  useEffect(() => {
    if (!live) return
    const timer = setTimeout(() => setTopics((all) => all.map((topic) => (topic.id === 'nav' ? { ...topic, at: 0, atLabel: 'Just now' } : topic))), 2000)
    return () => clearTimeout(timer)
  }, [live])

  const join = (id: string, member: boolean) => setTopics((all) => all.map((topic) => (topic.id === id ? { ...topic, members: member ? [...topic.members, viewer] : topic.members.filter((who) => who !== viewer) } : topic)))
  // Follow Ship's own links in the story: a row, the sidebar, the path.
  const follow = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const next = anchor && placeOf(anchor.getAttribute('href') ?? '')
    if (!next) return
    event.preventDefault()
    setPlace(next)
  }

  const threadsOf = (id: string) => threads[id] ?? (id === 'widgets' ? TOPIC_THREADS : id === 'brand' ? [] : OTHER_THREADS)
  const say = (id: string, change: (held: ThreadData[]) => ThreadData[]) => setThreads((all) => ({ ...all, [id]: change(threadsOf(id)) }))
  const message = (body: string) => ({ id: `m${Date.now()}`, author: personOf(viewer), at: Math.floor(Date.now() / 1000), body })

  let content
  if (place.type === 'explore') {
    content = <TopicsView title="Topics" lists={topicsRead === 'ok' ? exploreLists(viewer, topics) : topicsRead} tab={tab} onTab={setTab} onRetry={() => setTopicsRead('ok')} onJoin={(address) => join(address.split(':')[2], true)} query={query} />
  } else if (place.type === 'projects') {
    content = <ProjectsView lists={PROJECT_TABS} tab={projectsTab} onTab={setProjectsTab} layout={layout} onLayout={setLayout} showFolder onAddProject={fn()} />
  } else if (place.type === 'issues') {
    content = <IssuesView issues={ISSUES} statuses={ISSUE_STATUSES} mine={new Set()} scope={scope} onScope={setScope} hrefFor={issueHref} onAddIssue={fn()} />
  } else if (place.type === 'file') {
    // Not this project's: a project's or an issue's page opens here, as today.
    content = <EmptyState scope="page" message="The project’s or issue’s page, as today." />
  } else {
    const id = place.id
    const topic = topics.find((x) => x.id === id)!
    const page = canOpen(viewer, topic) ? topicPage(id, viewer, topics) : undefined
    content = (
      <TopicView
        key={id}
        topic={!page ? 'unavailable' : topicRead === 'ok' ? page : topicRead}
        documents={documentsRead === 'ok' ? (page?.documents ?? []) : documentsRead}
        onRetry={() => setTopicRead('ok')}
        onRetryDocuments={() => setDocumentsRead('ok')}
        topicsHref={EXPLORE_HREF}
        members={
          page && (
            <Members
              members={new Map(page.members.map((who) => [who, true]))}
              me={viewer}
              people={PEOPLE}
              nameOf={(key) => PEOPLE.find((p) => p.value === key)?.name ?? key}
              personOf={(key) => PEOPLE.find((p) => p.value === key) ?? {}}
              roles={[]}
              {...(page.archived ? { readOnlyReason: 'Archived. Unarchive it in Peek to join.' } : {})}
              onSetMine={async (member) => (join(id, member), true)}
              onAdd={async () => true}
            />
          )
        }
        conversation={{
          threads: threadsOf(id),
          shown,
          onShownChange: setShown,
          onStart: async (text) => (say(id, (held) => [...held, { id: `t${Date.now()}`, root: message(text), replies: [] }]), true),
          onReply: async (threadId, text) => (say(id, (held) => held.map((thread) => (thread.id === threadId ? { ...thread, replies: [...thread.replies, message(text)] } : thread))), true),
          ...(page?.archived ? { closed: archivedLine({}, undefined, { in: 'Peek', to: 'reply' }) } : {}),
        }}
        onCopyLink={fn()}
        onOpenInPeek={fn()}
        upload={pretendUpload}
      />
    )
  }

  return (
    <div className="h-screen" onClickCapture={follow}>
      <AppShell
        logo="Estiva Ship"
        navOpen={navOpen}
        onNavOpenChange={setNavOpen}
        identity={<IdentityMenu me={personOf(viewer)} signedIn idBase="https://id.estiva.app" relayUrl="http://localhost:3000" onCopyKey={fn()} onSignOut={fn()} />}
        nav={
          <ShipSidebar
            openIssues={18}
            activeProjects={5}
            hrefFor={(entry, folder) => (folder ? `#/app/folder/${folder}/${entry}` : entry === 'topics' ? EXPLORE_HREF : `#/${entry}`)}
            folders={FOLDERS}
            onOpenFolder={fn()}
            onNewFolder={fn()}
            current={sidebarPlace(place)}
            topics={topicsRead === 'ok' ? sidebarTopics(viewer, topics) : topicsRead}
            onRetryTopics={() => setTopicsRead('ok')}
          />
        }
      >
        {content}
      </AppShell>
    </div>
  )
}

const meta = {
  title: 'Prototype/Topics level-up/Ship',
  parameters: { layout: 'fullscreen' },
  // Each story is the whole app: a Docs page of all of them would draw sixteen apps at once.
  tags: ['!autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Widgets, as Miky: the sidebar's five newest topics with Widgets folded open; its page with Projects (as the Projects page), Issues, Documents; its conversation beside it. */
export const ATopicsPage: Story = { name: 'Ship: a topic’s page', render: () => <ShipApp /> }

/** The same page with the conversation put away from the header's button, left of the ⋯. */
export const ConversationHidden: Story = { name: 'Ship: a topic’s page, conversation hidden', render: () => <ShipApp conversationShown={false} /> }

/** Explore topics = Ship's Topics page: All, Your topics, Other topics, Archived, a search, Join. All is A to Z. */
export const Explore: Story = { name: 'Ship: Topics (Explore topics)', render: () => <ShipApp start={{ type: 'explore' }} /> }

/** Your topics: the sidebar's order, newest activity first. */
export const ExploreYours: Story = { name: 'Ship: Topics, your topics', render: () => <ShipApp start={{ type: 'explore' }} exploreTab="yours" /> }

/** Other topics, A to Z, each with Join. */
export const ExploreOthers: Story = { name: 'Ship: Topics, other topics', render: () => <ShipApp start={{ type: 'explore' }} exploreTab="others" /> }

/** A search that finds nothing. */
export const ExploreNoMatch: Story = { name: 'Ship: Topics, nothing found', render: () => <ShipApp start={{ type: 'explore' }} query="roadmap" /> }

/** An archived topic opens read-only: its page as it was, and the conversation takes no reply. */
export const Archived: Story = { name: 'Ship: an archived topic', render: () => <ShipApp start={{ type: 'topic', id: 'comments' }} /> }

/** Katerina on a topic she is not in: she reads it all; the members pill opens Join. */
export const NotAMember: Story = { name: 'Ship: a topic you’re not in', render: () => <ShipApp viewer="katerina" start={{ type: 'topic', id: 'suits' }} /> }

/** A topic that lists nothing yet: its conversation still beside it. */
export const Empty: Story = { name: 'Ship: a topic with nothing in it', render: () => <ShipApp viewer="katerina" start={{ type: 'topic', id: 'brand' }} /> }

/** Katerina on an Engineering topic she cannot read: the card any file you can't open gets, as today. */
export const NoAccess: Story = { name: 'Ship: a topic you can’t open', render: () => <ShipApp viewer="katerina" start={{ type: 'topic', id: 'fast' }} /> }

/** Your topics and the topic itself on their way. */
export const Loading: Story = { name: 'Ship: loading', render: () => <ShipApp topicsRead="loading" topicRead="loading" /> }

/** Your topics' read and the topic's both failed: each says so, with Try again. */
export const Failed: Story = { name: 'Ship: read failed', render: () => <ShipApp topicsRead="failed" topicRead="failed" /> }

/** The topic read, its documents' titles not. */
export const DocumentsFailed: Story = { name: 'Ship: documents didn’t load', render: () => <ShipApp documentsRead="failed" /> }

/** The Topics page while its read is out, and when it failed. */
export const ExploreLoading: Story = { name: 'Ship: Topics loading', render: () => <ShipApp start={{ type: 'explore' }} topicsRead="loading" /> }
export const ExploreFailed: Story = { name: 'Ship: Topics read failed', render: () => <ShipApp start={{ type: 'explore' }} topicsRead="failed" /> }

/** In no topic at all: the sidebar says so above Explore topics, so there is still a way in. */
export const NoTopics: Story = { name: 'Ship: no topics yet', render: () => <ShipApp none start={{ type: 'projects' }} /> }

/**
 * Two seconds in, somebody writes in Universal Navigation. Ship does not move it under the pointer: the sidebar keeps
 * its order until the next open, while the Topics page, opened after, has it first under Your topics.
 */
export const NewMessageWaits: Story = { name: 'Ship: a new message waits for the next open', render: () => <ShipApp live start={{ type: 'projects' }} /> }
