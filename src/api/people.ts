import type { FolderState } from '../nostr/fold'

/**
 * Everyone visible in a workspace snapshot — the directory's fetch list.
 *
 * Copied from the old app's `participants` (apps/ship/ui.ts) rather than
 * imported: that file is DOM code and goes with REW-9, this rule stays. The
 * rule is the old app's, unchanged: authors, leads and assignees, every voice
 * in every thread, everyone who ever changed something — and an assignee that
 * has since been changed away from is still a person who works here.
 *
 * **Always including the viewer**, even when they appear nowhere. Without
 * that, a person who has not yet touched anything is never looked up, and the
 * identity menu shows their raw key on the one screen whose job is saying who
 * they are.
 */
export function peopleIn(state: FolderState, me: string): string[] {
  const seen = new Set<string>()
  for (const project of state.projects) {
    seen.add(project.author)
    if (project.lead) seen.add(project.lead)
  }
  for (const issue of state.issues) {
    seen.add(issue.author)
    if (issue.assignee) seen.add(issue.assignee)
  }
  for (const conversation of state.conversations) {
    seen.add(conversation.root.author)
    for (const reply of conversation.replies) seen.add(reply.author)
  }
  for (const change of state.activity) {
    seen.add(change.author)
    if (/^[0-9a-f]{64}$/.test(change.value)) seen.add(change.value)
  }
  seen.delete('')
  const sorted = [...seen].sort()
  return sorted.includes(me) ? sorted : [me, ...sorted]
}

/** The relay's member list (NIP-43), which Peek reads the same way for `@` (REM-6). */
export const KIND_MEMBERSHIP_LIST = 13534

/** The keys a membership list names, or `null` for a relay that keeps none. */
export function rosterOf(events: readonly { kind: number; created_at: number; tags: string[][] }[]): string[] | null {
  const roster = events.filter((e) => e.kind === KIND_MEMBERSHIP_LIST).sort((a, b) => b.created_at - a.created_at)[0]
  if (!roster) return null
  return [...new Set(roster.tags.filter((t) => (t[0] === 'member' || t[0] === 'p') && /^[0-9a-f]{64}$/.test(t[1] ?? '')).map((t) => t[1]))]
}

/**
 * Who `@` and `!@` offer (CON-25): the workspace's members, agents included,
 * as Peek's `mentionablePeopleOf` — and never the viewer, who does not mention
 * themselves. With no roster, the people in the snapshot.
 */
export function mentionableIn(roster: readonly string[] | null, snapshot: readonly string[], me: string): string[] {
  return (roster ?? snapshot).filter((pubkey) => pubkey !== me)
}

/** A pubkey, shortened the way the old app shows one it has no name for. */
export const short = (pubkey: string) => `${pubkey.slice(0, 8)}…`
