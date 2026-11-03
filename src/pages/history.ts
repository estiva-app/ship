import type { DirectoryView, FolderState } from '@/api'
import { MEMBER_FIELD_PREFIX, memberOfField } from '@estiva-app/conversation'
import type { HistoryEntry } from '@/components/History'
import { ISSUE_STATUSES, lookupStatus, type VocabEntry } from '@/nostr/kinds'
import { ago } from '@/lib/time'
import type { SignedEvent } from '@estiva-app/protocol'
import { parseChanges, type Change as FoldChange } from '@/nostr/fold'

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
/**
 * `state` with the opened project's every change in its activity, from the
 * page's own read of them (`useFeedJudges`'s `changes`), where projects are
 * read by their fields (ALO-5) and the load holds only each field's current
 * change. Oldest first, in the fold's order (SPEC §6.3). Until that read has
 * come back, `state` as it is.
 */
export function withChangesOf(addr: string, state: FolderState, changes: readonly SignedEvent[] | undefined): FolderState {
  if (!changes) return state
  const at = (change: FoldChange) => (change.ts !== undefined && Math.floor(change.ts / 1000) === change.createdAt ? change.ts : change.createdAt * 1000)
  const own = changes
    .flatMap(parseChanges)
    .filter((change) => change.target === addr)
    .sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { ...state, activity: [...state.activity.filter((change) => change.target !== addr), ...own] }
}

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

/**
 * When a file last changed, as its page's header says it (the kit's `PageHeader` `time`): "Edited 5m ago", and who
 * and exactly when under the pointer. Its newest change, leaving out who follows it, as the issues table's Updated
 * does (SHI-31); a file not changed since it was made says when it was made, and by whom.
 */
export function editedFor(addr: string, state: FolderState, directory: DirectoryView, created: { at: number; by: string }): { label: string; exact: string } {
  const touched = state.activity.filter((change) => change.target === addr && !change.field.startsWith(MEMBER_FIELD_PREFIX)).at(-1)
  const verb = touched ? 'Edited' : 'Created'
  const at = touched?.createdAt ?? created.at
  const by = directory.nameOf(touched?.author ?? created.by)
  return { label: `${verb} ${ago(at)}`, exact: `${verb} by ${by} · ${new Date(at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` }
}
