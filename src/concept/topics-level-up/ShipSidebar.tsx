import { useState, type ReactNode } from 'react'
import { IconArrowUpRight, IconBox, IconListDetails, IconPlus, IconTarget } from '@tabler/icons-react'
import { KindIcon, NavItem, NavTree, Sidebar as SidebarShell, type NavTreeGroup } from '@estiva-app/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { linkTo } from '@/router'

/**
 * PROTOTYPE (Topics level-up, concept branch only): a copy of `src/components/ShipSidebar.tsx`. What changed:
 * the top "Topics" entry goes; under Projects and Issues come your five newest topics, each folding to its
 * projects and issues in the topic's order, then "Explore topics" (no icon), which opens the same Topics page;
 * then Teams, as before. The order is the one the topics had when the sidebar first drew them: Ship reorders on
 * the next open, never under the pointer (Miky, 6 Nov).
 *
 * The rest of this comment is the original's.
 *
 * The sidebar: Topics, Projects, Issues, then each team folding to its own
 * Topics, Projects and Issues (SHIPS-5; Miky, 2 November, on the prototype
 * `ShipTopics.tsx`). There is no Home, no Views and no Starred: Home is
 * parked, and Ship has neither of the others. No inbox, no "my issues"; a
 * personal filter belongs to the list it filters, so Assigned to me is a tab
 * of Issues. The column itself is the shared shell (2026-09-02); what fills
 * it stays here.
 *
 * Until SHIPS-5 a team's fold held its active projects as rows (SHI-25), and
 * a project in no team sat under "Not in a Folder". Now a fold holds the same
 * three entries as the top, each a page over that team's files only, and the
 * projects are one click further, under its Projects; a project in no team is
 * under the top Projects only. Which Folders are the teams is the caller's to
 * say (`topLevelFolders` — the ones with state that nothing lists), and which
 * team a project is in is the team's state (FOL-5, `placedIn`).
 *
 * A team's title toggles its fold; the arrow on hover opens the Folder page,
 * which lists everything in it — the topics Peek filed there beside the
 * projects.
 *
 * Two kinds of number, each saying what it counts in its tooltip (ruling
 * A2): the Issues entry counts OPEN issues ("18 open"); the Projects entry
 * counts ACTIVE projects ("5 active"), restored on Katerina's ruling
 * (2026-08-26) after a first cut dropped it. A team's entries carry none.
 *
 * The folds start closed and this browser remembers how you left each one,
 * under the key below; opening a project or an issue opens the team holding
 * it and marks that team's Projects or Issues (Katerina, 30 October: opening a
 * file shows where it lives; the package's tree does it).
 *
 * Desktop only: the narrow-screen drawer is parked (ruling A5).
 */
/** Each team's fold is remembered under this key and its id. Not SHI-25's `ship.sidebar.team`: those folds held projects and were left open. */
const STORAGE_KEY = 'ship.sidebar.folder'

/** The three pages, at the top and in every team. */
export type SidebarEntry = 'topics' | 'projects' | 'issues'

/** A top-level Folder — a team — as the sidebar needs it. */
export interface SidebarFolder {
  /** The uuid — channel id, `h`, and the `d` of its state, all one (RFC 0.4 §5.2). */
  id: string
  /** Absent until something names it; the fold falls back to the id. */
  name?: string
  /** What the team's state lists (`FolderSummary.addresses`): which projects are in it (`placedIn`). */
  addresses?: string[]
}

/**
 * Which entry the route is on: a top entry, a team's entry (`folder`), or the
 * Folder page itself. Absent, none is lit — another app's file is none of the
 * sidebar's places.
 */
export type SidebarPlace = { entry: SidebarEntry; folder?: string } | { folderId: string } | { topic: string } | { file: string }

/** One of your topics: its page, and the projects and issues it lists, in its order. */
export interface SidebarTopic {
  id: string
  title: string
  href: string
  work: { id: string; kind: 'project' | 'issue'; title: string; href: string }[]
}

/** How many of your topics the sidebar shows; the rest are on the Topics page, under "Your topics". */
const TOPICS_SHOWN = 5

export interface ShipSidebarProps {
  /** Open issues across the workspace, minus archived projects. */
  openIssues: number
  /** Active projects across the workspace. */
  activeProjects: number
  /** Where an entry goes: the top one without `folder`, a team's with it. */
  hrefFor: (entry: SidebarEntry, folder?: string) => string
  /**
   * The teams, each a fold over its own Topics, Projects and Issues. Which
   * Folders those are is the caller's reading (`topLevelFolders`).
   *
   * **No count on a team**, unlike the top entries. A Folder's contents are
   * files from apps Ship does not own, so a number would either be Ship's
   * records only — which is a lie about a container that holds a topic — or a
   * resolve per Folder on every render. RFC 0.4 §4.2 also makes the count a
   * disclosure in its own right, so the fold states the name and nothing else.
   */
  folders?: SidebarFolder[]
  /** The arrow on a team's fold: open the Folder page. */
  onOpenFolder?: (folder: SidebarFolder) => void
  /**
   * "New folder" under the teams (FOL-8): a new top-level Folder, which then
   * shows here beside them. Absent, there is no such entry.
   */
  onNewFolder?: () => void
  current?: SidebarPlace
  /** The first workspace read has not landed, so the counts are unknown rather than zero — SHI-20. */
  loading?: boolean
  /**
   * The Folders are read separately and have not landed, so which teams there
   * are is unknown — placeholder rows, rather than a list that grows a moment later.
   */
  foldersLoading?: boolean
  /** Your topics, newest activity first; `loading` before the read lands, `failed` when it did not. */
  topics: SidebarTopic[] | 'loading' | 'failed'
  onRetryTopics: () => void
  className?: string
}

const ENTRIES: { entry: SidebarEntry; label: string; icon: ReactNode }[] = [
  { entry: 'topics', label: 'Topics', icon: <IconTarget size={16} stroke={1.5} /> },
  { entry: 'projects', label: 'Projects', icon: <IconBox size={16} stroke={1.5} /> },
  { entry: 'issues', label: 'Issues', icon: <IconListDetails size={16} stroke={1.5} /> },
]
/** The top: Projects and Issues. Topics is the section under them now; a team's fold keeps all three. */
const TOP = ENTRIES.filter(({ entry }) => entry !== 'topics')

/**
 * The topics in the order they had when they first landed: a topic with something new moves up on the next open,
 * not under the pointer. One that arrives later goes at the end.
 */
function useOrderAtOpen(topics: SidebarTopic[] | 'loading' | 'failed'): SidebarTopic[] | 'loading' | 'failed' {
  const [order, setOrder] = useState<string[]>()
  if (typeof topics === 'string') return topics
  if (!order) {
    setOrder(topics.map((topic) => topic.id))
    return topics
  }
  const at = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  return [...topics].sort((a, b) => at(a.id) - at(b.id))
}

/** A team entry's row id: the tree's `selected` names one. */
const rowId = (folder: string, entry: SidebarEntry) => `${folder}/${entry}`

export function ShipSidebar({ openIssues, activeProjects, hrefFor, folders = [], onOpenFolder, onNewFolder, current, loading = false, foldersLoading = false, topics: landed, onRetryTopics, className }: ShipSidebarProps) {
  const at = current && 'entry' in current ? current : undefined
  const topics = useOrderAtOpen(landed)
  const onTopic = current && 'topic' in current ? current.topic : undefined
  const onFile = current && 'file' in current ? current.file : undefined
  // Alphabetical teams, as Peek's column draws them; the relay's order tells the person nothing.
  const teams = [...folders].sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' }),
  )
  const pending = folders.length === 0 && foldersLoading
  /*
    The teams as the package's tree (Katerina, 2 October): each team a group,
    closed unless the reader opened it or it holds where you are, its three
    entries lightly indented under its name, the arrow on hover opening the
    Folder page.
  */
  const groups: NavTreeGroup[] | null = pending
    ? null
    : teams.map((team) => ({
        id: team.id,
        title: team.name ?? team.id,
        actions: onOpenFolder
          ? [{ icon: <IconArrowUpRight size={16} stroke={1.5} />, tooltip: 'Open team', onClick: () => onOpenFolder(team) }]
          : undefined,
        nodes: ENTRIES.map(({ entry, label, icon }) => ({ id: rowId(team.id, entry), label, icon, href: hrefFor(entry, team.id) })),
      }))
  const counts: Partial<Record<SidebarEntry, { count: number; countLabel: string }>> = loading
    ? {}
    : {
        projects: { count: activeProjects, countLabel: `${activeProjects} active` },
        issues: { count: openIssues, countLabel: `${openIssues} open` },
      }
  return (
    <SidebarShell className={className}>
      {TOP.map(({ entry, label, icon }) => (
        <NavItem key={entry} label={label} href={hrefFor(entry)} icon={icon} {...counts[entry]} active={!!at && !at.folder && at.entry === entry} />
      ))}
      {/* Your five newest topics, each folding to what Ship opens of it; then the way to every topic. */}
      <NavTree title="Topics">
        {topics === 'loading' ? (
          <SkeletonList rows={TOPICS_SHOWN} />
        ) : topics === 'failed' ? (
          <div className="px-2 py-1">
            <EmptyState scope="section" message="Didn’t load." action={{ label: 'Try again', onClick: onRetryTopics }} />
          </div>
        ) : topics.length === 0 ? (
          <div className="px-2 py-1">
            <EmptyState scope="section" message="You are in no topic yet." />
          </div>
        ) : (
          topics.slice(0, TOPICS_SHOWN).map((topic) => (
            <NavItem key={topic.id} label={topic.title} href={topic.href} icon={<KindIcon kind="topic" />} active={onTopic === topic.id} openFor={topic.work.some((w) => w.id === onFile) ? onFile : undefined} defaultOpen={onTopic === topic.id}>
              {topic.work.length > 0
                ? topic.work.map((work) => <NavItem key={work.id} label={work.title} href={work.href} icon={<KindIcon kind={work.kind} />} active={onFile === work.id} />)
                : undefined}
            </NavItem>
          ))
        )}
        {/* No icon: it is a way in, not another topic (Miky, 6 Nov). Where the top "Topics" entry went. */}
        <NavItem label="Explore topics" href={hrefFor('topics')} active={!!at && !at.folder && at.entry === 'topics'} />
      </NavTree>
      {/*
        A quiet "Folders" label, its + on the right for a new top-level Folder
        (FOL-8), over the teams. No label while the Folders are being read:
        which teams are coming is exactly what is not known yet.
      */}
      <NavTree
        title={pending ? undefined : 'Teams'}
        titleActions={onNewFolder ? [{ icon: <IconPlus size={16} stroke={1.5} />, tooltip: 'New team', onClick: onNewFolder }] : undefined}
        groups={groups}
        selected={at?.folder ? rowId(at.folder, at.entry) : undefined}
        onSelect={(selected, event) => linkTo(selected.href).onClick(event)}
        storageKey={STORAGE_KEY}
      />
    </SidebarShell>
  )
}
