import { useMarkRead } from '@/lib/useMarkRead'
import { signedIn } from '@/auth/estivaId'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ISSUE_STATUSES,
  PROJECT_STATUSES,
  archiveProject,
  createIssue,
  deleteProject,
  folderLink,
  me,
  pairProjectFolder,
  peopleIn,
  reply,
  assignMissingRefs,
  setProjectField,
  startConversation,
  projectContext,
  useMergedReadState,
  firstUnreadByThread,
  type DirectoryView,
  type FolderState,
} from '@/api'
import type { ThreadData } from '@/components/ConversationThread'
import type { IssuesTableRow } from '@/components/IssuesTable'
import { NewIssueDialog } from '@/components/NewIssueDialog'
import { PairFolderDialog } from '@/components/PairFolderDialog'
import type { RailPerson } from '@/components/ProjectRail'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectView } from '@/views/ProjectView'
import { go, href, type ProjectView as ProjectViewName } from '../router'
import { act, type Say } from './act'
import { hrefForIssue, rowFor } from './IssuesPage'

export type { Say } from './act'

/**
 * The old app's `stripReferences`: a `nostr:naddr…` in a body is the object
 * the message is about, already shown as the page — not text to read.
 */
export function stripReferences(body: string): string {
  return body.replace(/nostr:naddr1[0-9acdefghjklmnpqrstuvwxyz]+/gi, '').trim()
}

/** A conversation from the fold as the thread card draws it: names and faces for keys, the fold's order kept. */
export function threadFor(conversation: FolderState['conversations'][number], directory: DirectoryView): ThreadData {
  const message = (m: FolderState['conversations'][number]['root']) => ({
    id: m.id,
    author: directory.personOf(m.author),
    at: m.createdAt,
    body: stripReferences(m.body),
    // Carried for the unread rule only: your own writing is never new to you.
    by: m.author,
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

/**
 * One project from the fold, as the old app's projectView: its issues as a
 * table (Updated = the last change to that issue, or when it was opened)
 * or a board, every conversation in its Folder — deliberately including
 * the ones about an issue — and the rail. Every control writes one change
 * to one object and then re-reads the relay (`act`). Delete is offered
 * only to the author (NIP-09 honours nobody else) and asks first. A
 * project the fold does not have gets the old app's words, not a blank
 * page.
 */
export function ProjectPage({
  state,
  directory,
  addr,
  view,
  say,
  refresh,
}: {
  state: FolderState
  directory: DirectoryView
  addr: string
  view: ProjectViewName
  say: Say
  refresh: () => Promise<void>
}) {
  const project = state.projects.find((candidate) => candidate.addr === addr)
  const [dialog, setDialog] = useState<'issue' | 'pair' | 'delete' | null>(null)

  const issues = useMemo<IssuesTableRow[]>(() => {
    if (!project) return []
    return state.issues
      .filter((issue) => issue.projectAddr === project.addr)
      .map((issue) => {
        const touched = state.activity.filter((change) => change.target === issue.addr).at(-1)
        return { ...rowFor(issue, state, directory), openedBy: directory.personOf(issue.author), at: touched?.createdAt ?? issue.createdAt }
      })
  }, [project, state, directory])

  const conversations = useMemo(() => (project ? state.conversations.filter((c) => c.root.folder === project.contentFolder) : []), [project, state])
  /* A project *is* a container, so it takes the container context: its Folder's
     bare channel uuid (SPEC §11.1). Looking at the project marks the container
     read; its issues' discussions are separate contexts and are untouched. */
  useMarkRead([projectContext(project?.contentFolder)])
  const threads = useMemo(() => conversations.map((c) => threadFor(c, directory)), [conversations, directory])
  /* The divider in the feed (CRO-13). A project IS the container, so its own
     marker governs the roots and propagates down to their replies. */
  const merged = useMergedReadState()
  const unread = useMemo(
    () => firstUnreadByThread(threads, merged, projectContext(project?.contentFolder), me),
    [threads, merged, project],
  )
  const people = useMemo(() => railPeople(state, directory), [state, directory])

  if (!project) {
    return <EmptyState className="py-12" message="That project is not in this workspace, or lives in a Folder you cannot read." />
  }

  /*
    Number the issues Ship has not numbered yet.

    An issue created through the manifest by another app arrives with no display
    key, because only Ship can compute one — it is the project title plus a count
    of the siblings, which a consumer cannot see. Ship is the only participant
    that can, so Ship does it, here, where the siblings are known. The issues
    list spans projects and has no answer.

    Signed in only: a change event has to be signed by somebody, and the
    anonymous reader key would be publishing under an identity that is not a
    person. A reader without an account sees the dash, which is honest.

    `attempted` stops the five-second poll from re-firing while the writes are in
    flight — the state it reads has not refreshed yet, so without it every tick
    would queue the same batch again.
  */
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!project || !signedIn()) return
    const missing = issues.filter((row) => !row.ref && !attempted.current.has(row.addr))
    if (missing.length === 0) return
    for (const row of missing) attempted.current.add(row.addr)
    const mine = state.issues.filter((issue) => issue.projectAddr === project.addr)
    void assignMissingRefs(project, mine).then(() => refresh())
  }, [project, issues, state.issues, refresh])

  const done = issues.filter((issue) => issue.status === 'done').length
  const set = (field: 'title' | 'description' | 'status' | 'lead', value: string, note: string) => act(note, () => setProjectField(project, field, value, note), say, refresh)

  return (
    <>
      <ProjectView
        crumbs={{ projectsHref: href({ name: 'projects', archived: false }), title: project.title }}
        header={{
          title: project.title,
          description: project.description,
          archived: project.archived,
          onRename: (value) => set('title', value, 'Rename'),
          onDescribe: (value) => set('description', value, 'Description'),
        }}
        onAddIssue={() => setDialog('issue')}
        view={view}
        onView={(next) => go({ name: 'project', addr: project.addr, view: next })}
        issues={issues}
        issueStatuses={ISSUE_STATUSES}
        hrefFor={hrefForIssue}
        threads={threads}
        unread={unread}
        // A project conversation is already in the topic it belongs to, so a
        // reference would be noise (withReference: false), as the old app has it.
        onStartConversation={(body) => act('Message', () => startConversation({ folder: project.contentFolder, about: project.addr, withReference: false, body }), say, refresh)}
        onReply={(threadId, body) => {
          const conversation = conversations.find((c) => c.id === threadId)
          if (!conversation) return false
          return act('Reply', () => reply(conversation, project.contentFolder, body), say, refresh)
        }}
        rail={{
          status: project.status,
          statuses: PROJECT_STATUSES.map(({ value, label }) => ({ value, label })),
          onStatusChange: (value) => void set('status', value, `Status → ${value}`),
          lead: project.lead ?? '',
          people,
          // PEEK-22 calls this "assignee"; the spec's tag is `lead`. Same field.
          onLeadChange: (value) => void set('lead', value, value ? 'Assign project' : 'Unassign project'),
          done,
          total: issues.length,
          folder: project.contentFolder,
          onCopyFolderLink: () =>
            void copyText(folderLink(project.contentFolder), 'Folder link copied — paste it into Peek to pair a topic.', 'Copy this Folder link:', say),
          onPairFolder: () => setDialog('pair'),
          onArchive: () =>
            void act(project.archived ? 'Unarchive' : 'Archive', () => archiveProject(project, !project.archived), say, refresh).then((ok) => {
              if (ok) say(project.archived ? 'Project restored.' : 'Project archived.')
            }),
          onDelete: () => setDialog('delete'),
        }}
      />

      {dialog === 'issue' && (
        <NewIssueDialog
          projects={[{ value: project.addr, label: project.title }]}
          project={{ addr: project.addr, title: project.title }}
          onClose={() => setDialog(null)}
          onCreate={async (draft) => {
            const result = await createIssue(project, state.issues, draft)
            if (!result.ok) {
              say(`Issue rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            return true
          }}
        />
      )}

      {dialog === 'pair' && (
        <PairFolderDialog
          currentFolder={project.contentFolder}
          onClose={() => setDialog(null)}
          onPair={async (folder) => {
            const result = await pairProjectFolder(project, folder)
            if (!result.ok) {
              say(`Folder link rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            if (result.announced === false) {
              say(
                `Paired, and new issues will land in that Folder — but the Folder itself refused the note that says so${result.announceReason ? `: ${result.announceReason}` : '.'} Apps reading that Folder may not find this project until an issue is filed in it.`,
                'error',
              )
            } else {
              say('Paired. New issues will land in that Folder.')
            }
            return true
          }}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete “${project.title}”?`}
          confirmLabel="Delete project"
          destructive
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await deleteProject(project)
            if (!result.ok) {
              say(`Delete rejected — ${result.reason}`, 'error')
              return false
            }
            say('Deletion requested.')
            // Nothing left to render here.
            go({ name: 'projects', archived: false })
            await refresh()
            return true
          }}
        >
          <p>This publishes a NIP-09 deletion request. Relays may decline it, and copies held elsewhere are unaffected.</p>
          {issues.length > 0 && (
            <p>
              Its {issues.length} {issues.length === 1 ? 'issue is a separate event and is' : 'issues are separate events and are'} not deleted — they stay in the Folder and stop being
              reachable from here.
            </p>
          )}
          <p className="text-text-secondary">Archiving is reversible and usually what you want.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
