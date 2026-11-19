import { useCallback, useEffect, useState } from 'react'
import type { Issue } from '../nostr/fold'
import { issueFieldsNow } from './store'
import { readDeletedIssues } from './writes'

/**
 * The deleted issues this reader can read, while `active` (SPEC §6.5): read
 * where they are drawn, the Issues page's Archived tab, never on a load.
 * `undefined` while the read is in flight; empty where issues are not kept in
 * order, since a delete there is a request that leaves nothing to restore.
 * `reload` reads them again, after a Restore.
 */
export function useDeletedIssues(active: boolean): { deleted: Issue[] | undefined; reload: () => void } {
  const [deleted, setDeleted] = useState<Issue[] | undefined>(undefined)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    void (async () => {
      const issues = (await issueFieldsNow()) ? await readDeletedIssues().catch(() => []) : []
      if (live) setDeleted(issues)
    })()
    return () => {
      live = false
    }
  }, [active, round])
  const reload = useCallback(() => setRound((n) => n + 1), [])
  return { deleted, reload }
}
