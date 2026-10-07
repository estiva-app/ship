import { useMemo, useState } from 'react'
import { useOpeningReadState } from '@/api'
import type { UnreadByThread } from '@/components/ConversationThread'

/**
 * What a page's feed calls new, for `ThreadList`'s `unread` and `stillUnread` (99557309).
 *
 * `verdictAt` judges the page's conversations against a frontier — the page's
 * `unreadByThread` call — and answers undefined until it can (its judges are
 * still loading). `merged` is the page's `useMergedReadState`.
 *
 * - `unread`, where "New since you last read this" goes: judged against the
 *   frontier the visit opened on, and kept from its first answer that found
 *   something. The page's own dwell marks what it draws within a second and a
 *   half; judged against that, the divider went as soon as it was drawn. Kept,
 *   it stays until the person leaves the page. A comment that arrives while
 *   they read gets one only while there is none, so there is never a second
 *   (Miky, 2026-10-07).
 * - `stillUnread`, for "N new": judged against `merged`, so it leaves once the
 *   replies are read, as SHI-38 decided (Miky, 2026-10-07).
 *
 * Both are undefined until the tab's read state has loaded: nothing is new
 * rather than everything since the join.
 */
export function useNewSince(
  visit: string | undefined,
  merged: Readonly<Record<string, number>>,
  verdictAt: (frontier: Readonly<Record<string, number>>) => UnreadByThread | undefined,
): { unread?: UnreadByThread; stillUnread?: UnreadByThread } {
  const opening = useOpeningReadState(visit)
  const verdict = useMemo(() => (opening ? verdictAt(opening) : undefined), [opening, verdictAt])
  const stillUnread = useMemo(() => (opening ? verdictAt(merged) : undefined), [opening, merged, verdictAt])
  const [kept, setKept] = useState<{ visit: string | undefined; unread?: UnreadByThread }>({ visit })
  let current = kept
  if (current.visit !== visit) current = { visit }
  if (!current.unread && verdict && Object.keys(verdict).length > 0) current = { visit, unread: verdict }
  if (current !== kept) setKept(current)
  return { unread: current.unread ?? verdict, stillUnread }
}
