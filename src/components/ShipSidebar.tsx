import { useEffect, type ReactNode } from 'react'
import { IconListSearch, IconPlus, IconUsers } from '@tabler/icons-react'
import { CollapsibleSection, KindIcon, NavItem, NavTree, Sidebar as SidebarShell, useRememberedOpen } from '@estiva-app/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonList } from '@/components/ui/Skeleton'
import { TOPICS_SHOWN, type SidebarTopic } from '@/lib/topics'
import { href } from '@/router'
import { useReportFailure } from '@/lib/failureReports'
import { forgetOpenedFromInitiative, rememberOpenedFromInitiative, useOpenedFromInitiative } from '@/lib/openedFrom'

/**
 * The sidebar: Projects, Issues, your five newest topics then Explore topics
 * (TOPI-9; Miky, 4 and 6 Nov, on the approved story), then each team folding
 * to its own Topics, Projects and Issues (SHIPS-5; Miky, 2 November, on the
 * prototype `ShipTopics.tsx`). Each of your topics folds to the projects and
 * issues it lists; the order is the caller's, set when Ship opens or you come
 * back to the tab, so a row never moves under the pointer. There is no Home, no Views and no Starred: Home is
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
 * A team is a row like Peek's (Katerina, 18 November, C1: "A"): the team's icon
 * and name, a link to its page; under the pointer its icon turns into the
 * arrow, which alone folds its Initiatives, Projects and Issues (her 16 Nov rule:
 * a thing with a page is a link row). It replaced a heading whose whole row
 * folded, with the page behind a ↗ on hover.
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
 * One place is lit at a time (Katerina, 23 November: "you have 2 selections in
 * the sidebar"): a project or an issue clicked under one of your initiatives is
 * lit there, and its team stays as it was, as Peek lights a row only in the
 * column it was opened from; opened any other way, its team's place is lit. A
 * row folds by its arrow alone: an initiative's own page leaves its fold as it
 * is, as Peek's rows do.
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
  /** What it lists by id (`FolderSummary.ids`): a project moved there since the relay keeps it in order (SHI-64). */
  ids?: string[]
}

/**
 * Which entry the route is on: a top entry, a team's entry (`folder`), or the
 * Folder page itself. Absent, none is lit — another app's file is none of the
 * sidebar's places.
 */
export type SidebarPlace = { entry: SidebarEntry; folder?: string } | { folderId: string }

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
  /**
   * "New folder" under the teams (FOL-8): a new top-level Folder, which then
   * shows here beside them. Absent, there is no such entry.
   */
  onNewFolder?: () => void
  current?: SidebarPlace
  /**
   * Your five newest topics ({@link sidebarTopicsOf}), newest activity first;
   * `loading` before the topics and their order land, `failed` when either did not.
   */
  topics: SidebarTopic[] | 'loading' | 'failed'
  /** The topic whose page is open, by address: its row is lit, its fold left as it is. */
  openTopic?: string
  /** The project or issue open, by address: lit under the initiative it was clicked under, which opens; else under its team. */
  openFile?: string
  /** The first workspace read has not landed, so the counts are unknown rather than zero — SHI-20. */
  loading?: boolean
  /**
   * The Folders are read separately and have not landed, so which teams there
   * are is unknown — placeholder rows, rather than a list that grows a moment later.
   */
  foldersLoading?: boolean
  /**
   * The teams the viewer is in (`useTeamsYouAreIn`): those first, the rest folded under "Other teams", as Peek's Teams
   * column splits them (Katerina, 23 November). Absent while it is read, or when it could not be: every team in one list.
   */
  yours?: ReadonlySet<string>
  className?: string
}

const ENTRIES: { entry: SidebarEntry; label: string; icon: ReactNode }[] = [
  // A team's initiatives (Katerina, 18 November: "Initiatives, just like we do in Peek's Teams"); the code still says topics.
  // ◎ from the kit's KindIcon, the one part that names an initiative (review of 23 November, C7), in the row's own ink.
  { entry: 'topics', label: 'Initiatives', icon: <KindIcon kind="topic" tone="inherit" /> },
  // A project's and an issue's icons from the same part, as every row that names one draws them.
  { entry: 'projects', label: 'Projects', icon: <KindIcon kind="project" tone="inherit" /> },
  { entry: 'issues', label: 'Issues', icon: <KindIcon kind="issue" tone="inherit" /> },
]
/** The top: Projects and Issues. Topics is the section under them now (TOPI-9); a team's fold keeps all three. */
const TOP = ENTRIES.filter(({ entry }) => entry !== 'topics')

/** A team entry's row id: the tree's `selected` names one. */
const rowId = (folder: string, entry: SidebarEntry) => `${folder}/${entry}`

export function ShipSidebar({ openIssues, activeProjects, hrefFor, folders = [], onNewFolder, current, topics, openTopic, openFile, loading = false, foldersLoading = false, yours, className }: ShipSidebarProps) {
  useReportFailure(topics === 'failed' ? 'not-loaded' : undefined)
  const from = useOpenedFromInitiative()
  // The click is spent once another page opens: the same project opened later some other way is lit under its team.
  useEffect(() => forgetOpenedFromInitiative(openFile), [openFile])
  // The initiative whose fold holds the open project or issue, where it was clicked: lit there, and nowhere else.
  const litUnder =
    from && openFile === from.file && Array.isArray(topics) && topics.some((topic) => topic.id === from.topic && topic.work.some((work) => work.id === openFile))
      ? from.topic
      : undefined
  const place = litUnder ? undefined : current
  const at = place && 'entry' in place ? place : undefined
  // Alphabetical teams, as Peek's column draws them; the relay's order tells the person nothing.
  const teams = [...folders].sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' }),
  )
  const pending = folders.length === 0 && foldersLoading
  const mine = yours ? teams.filter((team) => yours.has(team.id)) : teams
  const others = yours ? teams.filter((team) => !yours.has(team.id)) : []
  // The team whose page, or one of whose entries, is open: Other teams opens for it, as a click would.
  const openTeam = place && 'folderId' in place ? place.folderId : at?.folder
  const otherOpen = !!openTeam && others.some((team) => team.id === openTeam)
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
      {/* In Peek's words (Katerina, 18 November): what was a topic is an initiative on screen; the code keeps "topic". */}
      <NavTree title="Initiatives">
        {topics === 'loading' ? (
          <SkeletonList rows={TOPICS_SHOWN} />
        ) : topics === 'failed' ? (
          // Peek's line, word for word (peek `TopicsColumn`), as Leaf's: no button squeezed beside it in the column, which
          // broke "Try again" onto two lines (review of 23 November, B3).
          <div className="px-2 py-1">
            <EmptyState scope="section" message="Couldn’t load your initiatives. Reload to try again." />
          </div>
        ) : topics.length === 0 ? (
          <div className="px-2 py-1">
            <EmptyState scope="section" message="You’re in no initiatives yet." />
          </div>
        ) : (
          topics.map((topic) => (
            <NavItem
              key={topic.id}
              label={topic.title}
              href={topic.href}
              icon={<KindIcon kind="topic" />}
              active={openTopic === topic.id}
              // Its arrow alone folds it, as Peek's rows: its own page leaves it as it is (Katerina, 23 November). It opens
              // for a row clicked inside it, folded by hand since or not.
              openFor={litUnder === topic.id ? openFile : undefined}
              defaultOpen={false}
            >
              {topic.work.length > 0
                ? topic.work.map((work) => (
                    <NavItem
                      key={work.id}
                      label={work.title}
                      href={work.href}
                      icon={<KindIcon kind={work.kind} />}
                      active={litUnder === topic.id && openFile === work.id}
                      onClick={() => rememberOpenedFromInitiative(topic.id, work.id)}
                    />
                  ))
                : undefined}
            </NavItem>
          ))
        )}
        {/* Peek's row, word and icon (Katerina, 18 November: "Explore initiatives along with the icon we used in Peek"). Where the top "Topics" entry went. */}
        <NavItem label="Explore initiatives" href={hrefFor('topics')} icon={<IconListSearch size={16} stroke={1.5} aria-hidden />} active={!!at && !at.folder && at.entry === 'topics'} />
      </NavTree>
      {/*
        A quiet "Folders" label, its + on the right for a new top-level Folder
        (FOL-8), over the teams. No label while the Folders are being read:
        which teams are coming is exactly what is not known yet.
      */}
      {/* The kit's skeleton while the teams are read; then a row each, 8px apart, as Peek's Teams column spaces them. */}
      <NavTree
        title={pending ? undefined : 'Teams'}
        titleActions={onNewFolder ? [{ icon: <IconPlus size={16} stroke={1.5} />, tooltip: 'New team', onClick: onNewFolder }] : undefined}
        {...(pending ? { groups: null } : {})}
        spaced
      >
        {mine.map((team) => (
          <TeamRow key={team.id} team={team} current={place} hrefFor={hrefFor} />
        ))}
        {others.length > 0 && (
          // Peek's fold, word and look: the kit's fold as a row among rows, with its count (Katerina, 16 November).
          <CollapsibleSection look="row" title="Other teams" count={others.length} defaultOpen={otherOpen} {...(otherOpen && openTeam ? { openFor: openTeam } : {})} contentClassName="gap-0.5">
            {others.map((team) => (
              <TeamRow key={team.id} team={team} current={place} hrefFor={hrefFor} />
            ))}
          </CollapsibleSection>
        )}
      </NavTree>
    </SidebarShell>
  )
}

/**
 * One team in the sidebar, as Peek's Teams column draws it: a link row to its page with the team's icon, lit while that
 * page is open, folding to its Initiatives, Projects and Issues. The fold is remembered in this browser under the key
 * the old group used, so nobody's folds change; it opens for the page it holds, as a click would, even when closed by
 * hand, and stays as left otherwise.
 */
function TeamRow({ team, current, hrefFor }: { team: SidebarFolder; current?: SidebarPlace; hrefFor: (entry: SidebarEntry, folder?: string) => string }) {
  const at = current && 'entry' in current && current.folder === team.id ? current : undefined
  const pageOpen = !!current && 'folderId' in current && current.folderId === team.id
  const [open, setOpen] = useRememberedOpen(`${STORAGE_KEY}.${team.id}`, !!at)
  return (
    <NavItem
      href={href({ name: 'folder', id: team.id })}
      label={team.name ?? team.id}
      icon={<IconUsers size={16} stroke={1.5} aria-hidden />}
      active={pageOpen}
      open={open}
      onOpenChange={setOpen}
      {...(at ? { openFor: rowId(team.id, at.entry) } : {})}
    >
      {ENTRIES.map(({ entry, label, icon }) => (
        <NavItem key={entry} label={label} href={hrefFor(entry, team.id)} icon={icon} active={!!at && at.entry === entry} />
      ))}
    </NavItem>
  )
}
