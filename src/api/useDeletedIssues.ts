import { useCallback, useEffect, useState } from 'react'
import type { Issue } from '../nostr/fold'
import { issueFieldsNow } from './store'
import { readDeletedIssues } from './writes'

/**
 * The deleted issues this reader can read, while `active` (SPEC §6.5): read
 * where they are drawn or counted, never on a load. `undefined` while the
 * read is in flight; empty where issues are not kept in order, since a delete
 * there is a request that leaves nothing to restore. `fresh` reads them anew
 * each time it turns active (the Archived tab, where someone else's delete
 * must show); otherwise the tab's one read is used (a key check). `reload`
 * reads them again, after a Restore.
 */
export function useDeletedIssues(active: boolean, fresh = false): { deleted: Issue[] | undefined; reload: () => void } {
  const [deleted, setDeleted] = useState<Issue[] | undefined>(undefined)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    void (async () => {
      const issues = (await issueFieldsNow()) ? await readDeletedIssues(fresh || round > 0).catch(() => []) : []
      if (live) setDeleted(issues)
    })()
    return () => {
      live = false
    }
  }, [active, fresh, round])
  const reload = useCallback(() => setRound((n) => n + 1), [])
  return { deleted, reload }
}
