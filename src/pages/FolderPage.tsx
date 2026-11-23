import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TeamMember } from '@estiva-app/conversation'
import { archiveFolder, me, renameFolder, type DirectoryView, type WorkspaceState } from '@/api'
import { folderArchiveImpact, loadQuery, readFolder, readTeamMembers, type FolderContents, type FolderSummary } from '@/api/foreign'
import { reloadTopics, useMuted, useTopicActivity, useTopicMembers, useTopics } from '@/api/topics'
import { ArchiveDialog, ArchivedNotice, type AvatarGroupMember } from '@estiva-app/ui'
import { ARCHIVE_WORDS, archivedNoticeOf, type Archives } from '@/lib/archive'
import { statusLabel } from '@/lib/issues'
import { editedLabel } from '@/lib/time'
import { splitByKind } from '@/lib/ownKinds'
import { projectTabs } from '@/lib/projects'
import { lastEditOf, topicsByTab } from '@/lib/topics'
import { ISSUE_STATUSES } from '@/nostr/kinds'
import { href } from '@/router'
import { reloadFolders } from '@/api/useFolders'
import { NewFolderDialog } from '@/components/NewFolderDialog'
import { SkeletonList } from '@/components/ui/Skeleton'
import { TeamView, type TeamFileRow, type TeamInitiativeRow } from '@/views/TeamView'
import { act, type Say } from '@/pages/act'
import { useTabTitle } from '@/lib/tabTitle'
import { useReportFailure } from '@/lib/failureReports'

const KIND_PROJECT = 30850
const KIND_ISSUE = 30851
const KIND_TOPIC = 30840

/** A person Ship cannot name yet: the shortened key, as the old page named an archiver. */
const SHORT = (pubkey: string) => `${pubkey.slice(0, 8)}…`

/**
 * The Folder page: the read, and the three states around it.
 *
 * Wiring only — `TeamView` draws it, as Peek draws a team's page (D6, Katerina 18 November). The split is the house rule (a view is
 * reviewable in Storybook, a fetch is not), and it earns its keep here for a
 * second reason: a Folder's contents are **not Ship's fold**. Every other page
 * in this app is handed `FolderState` and renders it; this one reads through
 * the projection layer, because the files belong to apps whose records Ship
 * neither stores nor understands.
 *
 * Read on mount and on `id`, not on the workspace poll. A Folder's contents
 * change when somebody moves a file, which is rare, and this costs a handful of
 * requests against a relay that meters reads at 300 a minute (SHI-12).
 *
 * **Renamed from its ⋮** (FOL-8; D6: Rename… opens Peek's rename dialog, where
 * the title was click-to-edit). Afterwards this Folder and the sidebar's
 * listing are read again, so the name on screen is the one the relay now holds.
 *
 * **What else it reads** (D6): who is in the team — its roster, once
 * (`readTeamMembers`); its initiatives — the topics read every Ship page
 * shares, with their people and Active as Explore reads them; and its projects'
 * and issues' facts from the workspace Ship already holds, once it has landed
 * (the rows draw at once, their facts as the workspace arrives).
 */
export function FolderPage({ id, folders, directory, state = null, archives, say }: {
  id: string
  /** The sidebar's listing, so the archive warning can name where a file stays visible (FOL-46). */
  folders?: FolderSummary[]
  /** Who everyone is: the archiver's name, the members' and the leads' faces. A Folder page does not wait for it. */
  directory?: Pick<DirectoryView, 'nameOf' | 'personOf' | 'profileOf'>
  /** Ship's workspace, for its projects' and issues' facts; `null` while it is read. */
  state?: WorkspaceState | null
  archives?: Archives | undefined
  say: Say
}) {
  const nameOf = directory?.nameOf ?? SHORT
  const personOf = directory?.personOf
  const profileOf = directory?.profileOf
  const [contents, setContents] = useState<FolderContents | null>(null)
  const [failed, setFailed] = useState(false)
  useReportFailure(failed ? 'not-loaded' : undefined)
  const [archiving, setArchiving] = useState<{ hides: string[]; staysVisible: string[] } | null>(null)
  const [renaming, setRenaming] = useState(false)
  // What Active and a last change count back from: when the page opened.
  const [now] = useState(() => Date.now())
  // Who is in the team: `loading` until its roster is read, `failed` when that read did not land.
  const [roster, setRoster] = useState<TeamMember[] | 'loading' | 'failed'>('loading')
  // The Folder on screen now, so a rename's re-read that lands after navigating away is dropped.
  const shown = useRef(id)
  // The tab names the Folder from this page's own read, as its heading does (SFX-2).
  useTabTitle(contents ? (contents.name ?? 'Untitled team') : undefined)

  useEffect(() => {
    shown.current = id
    let live = true
    setContents(null)
    setFailed(false)
    void (async () => {
      try {
        const next = await readFolder(id)
        if (live) setContents(next)
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [id])

  // Its roster, once per team (D6): who is in it, never who follows it (§11.8).
  useEffect(() => {
    let live = true
    setRoster('loading')
    readTeamMembers(id).then(
      (members) => live && setRoster(members),
      () => live && setRoster('failed'),
    )
    return () => {
      live = false
    }
  }, [id])

  // A face by its key: who Ship knows by profile, a dash for anyone it does not, as Explore draws them.
  const faceOf = useCallback(
    (pubkey: string): AvatarGroupMember => {
      const profile = profileOf?.(pubkey)
      return { name: profile?.name ?? '—', ...(profile?.picture ? { picture: profile.picture } : {}), ...(profile?.bot ? { bot: true } : {}) }
    },
    [profileOf],
  )

  // Its initiatives: the topics filed in this team, never a space (Ship never shows one), not archived — as Explore lists them.
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const { muted } = useMuted()
  const teamTopics = useMemo(() => (held ? topicsByTab(held, {}, id, muted).all.map((row) => row.address) : undefined), [held, id, muted])
  const active = useTopicActivity(held, teamTopics)
  const topicPeople = useTopicMembers(held, teamTopics)
  const initiatives = useMemo((): TeamInitiativeRow[] | 'loading' | 'failed' => {
    if (read === 'failed') return 'failed'
    if (!held) return 'loading'
    return topicsByTab(held, { at: active.values, members: topicPeople.values }, id, muted).all.map((row) => ({
      address: row.address,
      title: row.title,
      href: row.href,
      ...(row.summary ? { summary: row.summary } : {}),
      ...(row.members !== undefined ? { members: row.members, people: [...(row.people ?? [])] } : {}),
      ...(row.active ? { active: row.active } : {}),
    }))
  }, [read, held, active.values, topicPeople.values, id, muted])

  /*
    Ship's own files the team lists, in its order: each a row at once, from the
    team's read, its facts — status, lead or assignee, progress, last change —
    from the workspace Ship holds, as the Projects and Issues lists draw them.
  */
  const files = useMemo(() => {
    if (!contents) return undefined
    const { own, foreign } = splitByKind(contents.files)
    const listed = new Set(own.map((file) => file.address).filter((address): address is string => !!address))
    const tabs = state && archives ? projectTabs(state.projects.filter((project) => listed.has(project.addr)), state.issues, archives, personOf ?? ((pubkey) => ({ name: SHORT(pubkey) }))) : undefined
    const projectRows = new Map((tabs ? [...tabs.all, ...tabs.archived] : []).map((row) => [row.addr, row]))
    const projectsByAddr = new Map((state?.projects ?? []).map((project) => [project.addr, project]))
    const issuesByAddr = new Map((state?.issues ?? []).map((issue) => [issue.addr, issue]))
    const projects: TeamFileRow[] = []
    const issues: TeamFileRow[] = []
    for (const file of own) {
      const address = file.address
      if (!address) continue
      const d = address.split(':')[2] ?? ''
      const title = file.slots.title?.value || 'Untitled'
      if (file.kind === KIND_PROJECT) {
        const row = projectRows.get(address)
        const project = projectsByAddr.get(address)
        const edit = project?.author && project.createdAt !== undefined ? lastEditOf({ author: project.author, createdAt: project.createdAt, fields: project.fields ?? {} }) : undefined
        projects.push(
          row
            ? { address, title: row.title, href: row.href, status: row.status, ...(row.lead ? { person: row.lead } : {}), progress: row.progress, ...(edit ? { at: edit.at, edited: editedLabel(nameOf(edit.by), edit.at) } : {}) }
            : // Before the workspace lands: its name and link now, its facts as the kit's "not read yet" dash.
              { address, title, href: href({ name: 'project', d, slug: title, view: 'table' }), ...(tabs ? {} : { pending: true }) },
        )
      } else if (file.kind === KIND_ISSUE) {
        const issue = issuesByAddr.get(address)
        const edit = issue?.author && issue.createdAt !== undefined ? lastEditOf({ author: issue.author, createdAt: issue.createdAt, fields: issue.fields ?? {} }) : undefined
        issues.push(
          issue
            ? {
                address,
                title: issue.title,
                href: href({ name: 'issue', d: issue.id, slug: issue.title }),
                status: { value: issue.status, label: statusLabel(issue.status, ISSUE_STATUSES) },
                ...(issue.assignee && personOf ? { person: personOf(issue.assignee) } : {}),
                // Who changed it last and when, in Ship's words ("Ana, 1h ago"), as an initiative's rows say it.
                ...(edit ? { at: edit.at, edited: editedLabel(nameOf(edit.by), edit.at) } : {}),
              }
            : { address, title, href: href({ name: 'issue', d, slug: title }), ...(state ? {} : { pending: true }) },
        )
      }
    }
    // Counted, not listed: another app's file, and a topic this page does not list among its initiatives (a space, an
    // archived one). Until the initiatives are read every topic is taken as listed, so the count never drops.
    const shownTopics = Array.isArray(initiatives) ? new Set(initiatives.map((row) => row.address)) : undefined
    const others = foreign.filter((file) => file.kind !== KIND_TOPIC || (shownTopics !== undefined && !(file.address && shownTopics.has(file.address)))).length
    return { projects, issues, others }
  }, [contents, state, archives, personOf, nameOf, initiatives])

  const rename = useCallback(
    async (name: string) => {
      if (!contents) return false
      if (!name) {
        say('A team needs a name.', 'error', null)
        return false
      }
      // The channel's name is the title and its only home (SPEC §3.2), so there is nothing to read first.
      return act('Rename', () => renameFolder({ id: contents.id }, name), say, async () => {
        // One load for the read-back: the Folder and the listing ask for each change once between them (APP-2).
        const read = loadQuery()
        const [next] = await Promise.allSettled([readFolder(contents.id, read), reloadFolders(read)])
        if (next.status === 'fulfilled') {
          if (next.value.id === shown.current) setContents(next.value)
        } else {
          // Accepted, and not read back: without this the title would show the old name as though nothing happened.
          say(`Renamed to ${name}, but the team could not be read back — reload to see it.`, 'error', 'not-loaded')
        }
      }, undefined, 'not-renamed')
    },
    [contents, say],
  )

  /*
    Archive (FOL-46): a change on the Folder's own address, so what it holds is
    untouched and comes back with it. The warning is a read — what only this
    Folder lists, and what stays visible elsewhere — made when the person asks,
    not on every page load.
  */
  // Only the Folder's owners and admins, and on a team nobody owns the workspace's owners and admins (interop's `admins`, TEA-10): the relay refuses a rename (9002) from anybody else, and every reader ignores their archive (SPEC §3.2, §3.3).
  const isFolderAdmin = !!contents?.admins?.includes(me)
  const canArchive = !!contents?.channel && isFolderAdmin
  const reread = useCallback(async () => {
    const read = loadQuery()
    const [next] = await Promise.allSettled([readFolder(id, read), reloadFolders(read)])
    if (next.status === 'fulfilled' && next.value.id === shown.current) setContents(next.value)
  }, [id])
  const askToArchive = useCallback(async () => {
    if (!contents?.channel) return
    try {
      setArchiving(await folderArchiveImpact(contents.channel, folders))
    } catch (error) {
      say(`Could not count what archiving would hide — ${error instanceof Error ? error.message : String(error)}`, 'error', 'not-loaded')
    }
  }, [contents, folders, say])
  const setArchived = useCallback(
    async (archived: boolean, resolution?: string) => {
      if (!contents?.channel) return false
      const ok = await act(archived ? 'Archive' : 'Unarchive', () => archiveFolder({ id: contents.id, channel: contents.channel! }, archived, resolution), say, reread, undefined, archived ? 'not-archived' : 'not-restored')
      if (ok) say(archived ? 'Team archived' : 'Team restored')
      return ok
    },
    [contents, say, reread],
  )

  if (failed) {
    return (
      <div className="p-6 text-body-2 text-text-muted" data-folder-error={id}>
        This team could not be read.
      </div>
    )
  }

  if (!contents) {
    return (
      <div className="flex flex-col gap-3 p-6" data-loading="folder">
        <SkeletonList rows={4} />
      </div>
    )
  }

  const members = Array.isArray(roster) && roster.length > 0 ? { faces: roster.slice(0, 3).map((member) => faceOf(member.pubkey)), count: roster.length } : undefined
  return (
    <>
      <TeamView
        teamId={contents.id}
        {...(contents.name ? { name: contents.name } : {})}
        // Who is in it, once read; while it is read, or when the read failed, no pill: nothing is claimed (absence, not "nobody").
        {...(members ? { members } : {})}
        {...(isFolderAdmin ? { onRename: () => setRenaming(true) } : {})}
        {...(canArchive && !contents.archived ? { onArchive: () => void askToArchive() } : {})}
        initiatives={initiatives}
        onRetryInitiatives={() => void reloadTopics()}
        projects={files?.projects ?? []}
        issues={files?.issues ?? []}
        others={files?.others ?? 0}
        fromChannel={contents.source === 'channel'}
        faceOf={faceOf}
        now={now}
        archivedNotice={
          contents.archived && (
            <ArchivedNotice
              {...archivedNoticeOf({ by: contents.archived.by, at: contents.archived.at, resolution: contents.archived.resolution }, nameOf)}
              // The notice's Unarchive waits for the answer.
              {...(canArchive ? { onUnarchive: () => setArchived(false) } : {})}
            />
          )
        }
      />
      {renaming && <NewFolderDialog rename={contents.name ?? ''} onClose={() => setRenaming(false)} onCreate={rename} />}
      {archiving && (
        <ArchiveDialog
          {...ARCHIVE_WORDS}
          title={contents.name ?? 'Untitled team'}
          what="team"
          hides={archiving.hides.map((part) => `${part} only in it`)}
          staysVisible={archiving.staysVisible}
          onClose={() => setArchiving(null)}
          onArchive={(resolution) => setArchived(true, resolution || undefined)}
        />
      )}
    </>
  )
}
