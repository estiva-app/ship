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
export function peopleIn(state: FolderState, me: string, roster?: ReadonlySet<string> | null): string[] {
  // The workspace's members (kind 39002), so whoever only ever changed a
  // project is still here where projects are read by their fields (ALO-5): no
  // old change of theirs is read any more.
  const seen = new Set<string>(roster ?? [])
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

/** A pubkey, shortened the way the old app shows one it has no name for. */
export const short = (pubkey: string) => `${pubkey.slice(0, 8)}…`
