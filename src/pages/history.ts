import type { DirectoryView, FolderState } from '@/api'
import { MEMBER_FIELD_PREFIX, memberOfField } from '@estiva-app/conversation'
import type { HistoryEntry } from '@/components/History'
import { ISSUE_STATUSES, lookupStatus, type VocabEntry } from '@/nostr/kinds'

/**
 * An issue's or a project's slice of the change stream, in words, newest
 * first — the old app's `activity`, in the design's verbs (fixtures/projects.ts
 * `ACTIVITY`). Read off the fold's list in the fold's order, then reversed for
 * reading. A project's is read the same way, with its own statuses (ONE-6:
 * its History, and "Edited … ago" over its page).
 *
 * A description is the exception: its value is a whole document (a block
 * tree since RIC-8, marker text before), written by other people and other
 * apps, and the body is already on the page. So every description change
 * reads "edited the description", whatever its format or value (RIC-15).
 *
 * No row prints a wire value (564ee489, History.tsx's contract): a status by
 * its label, a move by the project's current title — "a project you can't
 * see" when it is not in your state, never its address — an archive as a
 * verb, a person by name. An unassign and a rename name what came before only
 * when an earlier change in this stream says it; the root's own values are
 * not here (Miky, 2026-10-06).
 */
export function historyFor(addr: string, state: FolderState, directory: DirectoryView, statuses: VocabEntry[] = ISSUE_STATUSES): HistoryEntry[] {
  const before = new Map<string, string>()
  return state.activity
    .filter((change) => change.target === addr)
    // Somebody else's "false" on your membership is not a leave (§11.8): the fold ignores it, and so does the history.
    .filter((change) => { const member = memberOfField(change.field); return member === undefined || change.value !== 'false' || change.author === member })
    .map((change) => {
      const previous = before.get(change.field)
      before.set(change.field, change.value)
      return { id: change.id, by: directory.personOf(change.author), at: change.createdAt, text: changeInWords(change.field, change.value, previous, state, directory, change.author, statuses) }
    })
    .reverse()
}

function changeInWords(field: string, value: string, previous: string | undefined, state: FolderState, directory: DirectoryView, author: string, statuses: VocabEntry[]): string {
  const person = (pubkey: string) => (/^[0-9a-f]{64}$/.test(pubkey) ? directory.nameOf(pubkey) : pubkey)
  // A membership change (SHI-31): the person is in the field, `member:<key>`.
  const member = memberOfField(field)
  if (member !== undefined) {
    if (member === author) return value === 'true' ? 'joined' : 'left'
    return `added ${person(member)}`
  }
  // A `member:` field naming no valid key is still about who follows it — never print it raw.
  if (field.startsWith(MEMBER_FIELD_PREFIX)) return 'changed who follows it'
  switch (field) {
    case 'description':
      return 'edited the description'
    case 'summary':
      // Never the text itself: it is up to ~240 characters, and blank is a clear.
      return value.trim() ? 'edited the summary' : 'removed the summary'
    case 'status':
      return `set status to ${lookupStatus(statuses, value).label}`
    case 'assignee':
      if (value) return `assigned ${person(value)}`
      return previous ? `unassigned ${person(previous)}` : 'removed the assignee'
    // A project's lead, as its picker says it: the person, or none.
    case 'lead':
      if (value) return `made ${person(value)} the lead`
      return previous ? `removed ${person(previous)} as the lead` : 'removed the lead'
    case 'title':
      return previous ? `renamed it from "${previous}" to "${value}"` : `renamed it to "${value}"`
    case 'project': {
      if (!value) return 'removed it from its project'
      const project = state.projects.find((candidate) => candidate.addr === value)
      return project ? `moved it to ${project.title}` : "moved it to a project you can't see"
    }
    case 'archived':
      return value ? 'archived it' : 'restored it'
    case 'ref':
      return value ? `gave it the reference ${value}` : 'removed its reference'
    default:
      return value ? `set ${field} to ${person(value)}` : `cleared ${field}`
  }
}
