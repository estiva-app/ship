import { useEffect, useSyncExternalStore } from 'react'
import { createRetryingRead } from '@estiva-app/platform'
import { readFolders } from './foreign'
import type { FolderSummary } from './foreign'
import type { QueryFn } from '@estiva-app/interop'

/**
 * The Folders a person navigates by — the teams (SHI-25): the ones with state
 * that nothing lists. Peek draws its Folders column from the same predicate,
 * which now lives in `@estiva-app/interop` rather than word for word in both
 * apps (FOL-5), so the two show the same sections.
 */
export { topLevelFolders } from '@estiva-app/interop'

/**
 * A refusal answers the same way next time; anything else — the relay did not
 * answer, or asked us to wait — may not. The words are the relay's
 * (`restricted: not a channel member`), as `Store` already reads them.
 */
const retryable = (error: unknown) => !/restricted:|not[ _]a[ _](channel[ _])?member/i.test(String(error))

/**
 * One listing per tab, held past the sidebar that asked for it — the
 * platform's `createRetryingRead`, which is Peek's FOL-42 `useFolders`
 * without React.
 */
const listing = createRetryingRead<FolderSummary[]>({ retryable })

/**
 * The Folders this identity can see, for the sidebar.
 *
 * **Read once per tab, not on the workspace poll.** A Folder's name changes
 * about as often as a channel is created, and this is a global query across two
 * kinds — putting it on the tick would spend a request a second of the relay's
 * 300-a-minute budget (SHI-12) to re-learn the same list.
 *
 * **A failed read is read again, and never replaces a good one** (FOL-5).
 * Until then a failure was an empty list for the rest of the session, and
 * with it every project fell out of its team until a reload. Now it is read
 * again on the platform's backoff (5 s doubling to 60 s, or the relay's own
 * wait for a quota refusal).
 *
 * `undefined` while the answer is still coming — including a first read that
 * failed and is being read again — so the sidebar keeps its placeholder rows
 * rather than drawing every project as unfiled and regrouping a moment later.
 * An empty list once a read has landed, or once a refusal says none will.
 */
/**
 * Read the Folders again, now — after a write that changed what one lists, a
 * project moved (FOL-7). The held listing stays on screen until the answer
 * lands, and a failure keeps it, as a first read's would. `read` is the load
 * a Folder's own read-back shares, so the two ask for each change once (APP-2).
 */
export function reloadFolders(read?: QueryFn): Promise<void> {
  // Only the first attempt: a retry seconds later is another load and reads afresh.
  let shared = read
  return listing.reload(() => {
    const load = shared
    shared = undefined
    return readFolders(load)
  })
}

export function useFolders(): FolderSummary[] | undefined {
  const snapshot = useSyncExternalStore(listing.subscribe, listing.snapshot)
  useEffect(() => {
    void listing.ensure(() => readFolders())
  }, [])
  if (snapshot.value) return snapshot.value
  return snapshot.error !== undefined && !snapshot.retrying ? [] : undefined
}
