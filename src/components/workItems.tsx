import { KindIcon, type AvatarGroupMember, type ItemListRow, type LinkedStatus } from '@estiva-app/ui'
import { formatActive } from '@/lib/time'
import { ISSUE_STATUSES, PROJECT_STATUSES } from '@/nostr/kinds'

/**
 * What a row is: an initiative (`topic`, the code's word), a project, an issue, a Leaf document or another app's file —
 * its kind's icon, and which facts it has.
 */
export type WorkKind = 'topic' | 'project' | 'issue' | 'document' | 'file'

/**
 * One of the things a team's page or an initiative's page lists, as Ship reads it. {@link workItems} turns it into the
 * kit's `ItemList` row: each fact in the same column whatever the kind; one a kind does not have is an empty cell, and
 * one not read yet is the kit's dash.
 */
export interface WorkItem {
  address: string
  title: string
  /** Where it opens. Absent: nowhere (a document whose app gave no address) — its name is words, not a link. */
  href?: string
  /** Another app's file (a Leaf document): it opens there, in a new tab. */
  external?: boolean
  /** Rows under it, in the same columns, folding (a document's pages, Katerina 23 November). */
  rows?: WorkItem[]
  /** Under the name, one line: an initiative's summary, an issue's project on an initiative's page, another app's file's type. */
  description?: string
  /** A project's or an issue's status, in Ship's vocabulary. */
  status?: { value: string; label: string }
  /** A project's lead, an issue's assignee, who edited a document last: one face. */
  person?: { name?: string; picture?: string; bot?: boolean }
  /** An initiative's people: up to three faces and how many; `undefined` until read. */
  members?: { faces: AvatarGroupMember[]; count: number }
  /** A project's issues done of all. */
  progress?: { done: number; total: number }
  /** Unix seconds: when anything last happened in it — an initiative's Active, a project's or an issue's last change. */
  at?: number
  /**
   * A project's, an issue's or a document's last change in Ship's words, who and when: "Ana, 1h ago" (Katerina, 23 November: "if the
   * who edited last is the current wording keep it"). Shown in When in place of the bare time.
   */
  edited?: string
  /**
   * Its facts are not read yet (a team's page drawn before Ship's workspace lands): every fact its kind has is the kit's
   * dash, "not read yet", never the empty cell that says "this kind has none".
   */
  pending?: boolean
}

/**
 * A status in Ship's vocabulary as the kit's list writes it: its words, and the shape its colour gives (Ship's own
 * vocabulary declares the same four colours the kit draws). A value the vocabulary does not know keeps its words, in
 * the open shape.
 */
function statusOf(kind: 'project' | 'issue', status: { value: string; label: string }): LinkedStatus {
  const entry = (kind === 'project' ? PROJECT_STATUSES : ISSUE_STATUSES).find((option) => option.value === status.value)
  return { label: status.label, colour: entry?.colour ?? 'neutral' }
}

/**
 * Ship's rows on a team's page and an initiative's page as the kit's `ItemList` draws them (Katerina, 18 November, D6
 * and A4; 23 November, Q7 and Q8: the kit's list, its status in the kit's words): **Status** (a project's, an issue's),
 * **People** (an initiative's faces in the members pill, a project's lead, an issue's assignee, who edited a document
 * last), **Progress** (a project's, as the small ring) and **When** (an initiative's Active; a project's, an issue's or a
 * document's last change, "Ana, 1h ago"). A fact a kind does not have is `null`, an empty cell; one not read yet is left
 * out, the dash. A Leaf document opens in Leaf, in a new tab, and folds to its pages.
 */
export function workItems(kind: WorkKind, rows: WorkItem[], now: number = Date.now()): ItemListRow[] {
  const item = (row: WorkItem): ItemListRow => {
    // A project's or an issue's facts not read yet: the dash in every column its kind has.
    const waiting = kind !== 'topic' && !!row.pending
    return {
      id: row.address,
      label: row.title,
      icon: <KindIcon kind={kind === 'document' ? 'file' : kind} />,
      ...(row.href ? { href: row.href, external: !!row.external } : {}),
      ...(row.description ? { description: row.description } : {}),
      status: kind !== 'project' && kind !== 'issue' ? null : waiting ? undefined : row.status ? statusOf(kind, row.status) : null,
      // As `ProjectRow` draws a lead: a person with no name read yet is the kit's face for nobody named, not a letter.
      people: kind === 'topic' ? (row.members === undefined ? undefined : { members: row.members }) : waiting ? undefined : row.person ? { person: row.person } : null,
      progress: kind !== 'project' ? null : waiting ? undefined : (row.progress ?? null),
      // An initiative's Active not read yet is the dash, as Explore's; for a project or an issue no time is nothing to say.
      when: kind !== 'topic' && row.edited ? row.edited : row.at ? formatActive(row.at * 1000, now) : kind === 'topic' || waiting ? undefined : null,
      ...(row.rows?.length ? { rows: row.rows.map(item) } : {}),
    }
  }
  return rows.map(item)
}
