import { useMemo } from 'react'
import { ISSUE_STATUSES, PROJECT_STATUSES, folderLink, me, peopleIn, type DirectoryView, type FolderState } from '@/api'
import type { ThreadData } from '@/components/ConversationThread'
import type { IssuesTableRow } from '@/components/IssuesTable'
import type { RailPerson } from '@/components/ProjectRail'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectView } from '@/views/ProjectView'
import { go, href, type ProjectView as ProjectViewName } from '../router'
import { hrefForIssue, rowFor } from './IssuesPage'
import { WRITES_LATER } from './ProjectsPage'

export type Say = (text: string, tone?: 'ok' | 'error') => void

/** A conversation from the fold as the thread card draws it: names and faces for keys, the fold's order kept. */
export function threadFor(conversation: FolderState['conversations'][number], directory: DirectoryView): ThreadData {
  const message = (m: FolderState['conversations'][number]['root']) => ({
    id: m.id,
    author: directory.personOf(m.author),
    at: m.createdAt,
    body: m.body,
  })
  return { id: conversation.id, root: message(conversation.root), replies: conversation.replies.map(message) }
}

/** Everyone in the workspace as a picker option, ordered by name — by key would be ordered by nothing a person can see. */
export function railPeople(state: FolderState, directory: DirectoryView): RailPerson[] {
  return peopleIn(state, me)
    .map((pubkey) => ({ value: pubkey, name: directory.nameOf(pubkey), picture: directory.personOf(pubkey).picture }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Put text on the clipboard, or show it when the clipboard is not available — the old app's fallback. */
export async function copyText(text: string, done: string, prompt: string, say: Say) {
  try {
    await navigator.clipboard.writeText(text)
    say(done)
  } catch {
    window.prompt(prompt, text)
  }
}

/** The write controls exist but cannot succeed yet (REW-5); they say so rather than fail. */
const inert = () => false

/**
 * One project from the fold, as the old app's projectView: its issues as a
 * table (Updated = the last change to that issue, or when it was opened)
 * or a board, every conversation in its Folder — deliberately including
 * the ones about an issue — and the rail. Delete is offered only to the
 * author (NIP-09 honours nobody else). A project the fold does not have
 * gets the old app's words, not a blank page.
 */
export function ProjectPage({ state, directory, addr, view, say }: { state: FolderState; directory: DirectoryView; addr: string; view: ProjectViewName; say: Say }) {
  const project = state.projects.find((candidate) => candidate.addr === addr)

  const issues = useMemo<IssuesTableRow[]>(() => {
    if (!project) return []
    return state.issues
      .filter((issue) => issue.projectAddr === project.addr)
      .map((issue) => {
        const touched = state.activity.filter((change) => change.target === issue.addr).at(-1)
        return { ...rowFor(issue, state, directory), openedBy: directory.personOf(issue.author), at: touched?.createdAt ?? issue.createdAt }
      })
  }, [project, state, directory])

  const threads = useMemo(
    () => (project ? state.conversations.filter((c) => c.root.folder === project.contentFolder).map((c) => threadFor(c, directory)) : []),
    [project, state, directory],
  )
  const people = useMemo(() => railPeople(state, directory), [state, directory])

  if (!project) {
    return <EmptyState className="py-12" message="That project is not in this workspace, or lives in a Folder you cannot read." />
  }

  const done = issues.filter((issue) => issue.status === 'done').length
  return (
    <ProjectView
      crumbs={{ projectsHref: href({ name: 'projects', archived: false }), title: project.title }}
      header={{ title: project.title, description: project.description, archived: project.archived, onRename: inert, onDescribe: inert }}
      view={view}
      onView={(next) => go({ name: 'project', addr: project.addr, view: next })}
      issues={issues}
      issueStatuses={ISSUE_STATUSES}
      hrefFor={hrefForIssue}
      threads={threads}
      onStartConversation={inert}
      onReply={inert}
      rail={{
        status: project.status,
        statuses: PROJECT_STATUSES.map(({ value, label }) => ({ value, label })),
        onStatusChange: () => {},
        lead: project.lead ?? '',
        people,
        onLeadChange: () => {},
        done,
        total: issues.length,
        folder: project.contentFolder,
        onCopyFolderLink: () =>
          void copyText(folderLink(project.contentFolder), 'Folder link copied — paste it into Peek to pair a topic.', 'Copy this Folder link:', say),
        onPairFolder: () => {},
        onArchive: () => {},
        onDelete: () => {},
        canDelete: project.author === me,
      }}
      readOnlyReason={WRITES_LATER}
    />
  )
}
