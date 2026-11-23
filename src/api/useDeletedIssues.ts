import { useCallback, useEffect, useState } from 'react'
import type { Issue } from '../nostr/files'
import { issueFieldsNow } from './store'
import { readDeletedIssues, readIssueByLink } from './writes'

/**
 * An issue opened by its link that the page does not hold, read while
 * `missing` where issues are kept in order: a deleted one, which no load
 * carries (SPEC §6.5). `reading` until the answer, so the page does not first
 * say it is not there; `reread` after a Restore.
 */
export function useIssueByLink(d: string, missing: boolean): { issue: Issue | undefined; reading: boolean; reread: () => void } {
  const [found, setFound] = useState<{ d: string; round: number; issue: Issue | undefined } | undefined>(undefined)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!missing) return
    let live = true
    void (async () => {
      // A read that does not answer leaves the page saying it cannot find the issue, as before.
      const issue = await issueFieldsNow()
        .then((switched) => (switched ? readIssueByLink(d) : undefined))
        .catch(() => undefined)
      if (live) setFound({ d, round, issue })
    })()
    return () => {
      live = false
    }
  }, [d, missing, round])
  const reread = useCallback(() => setRound((n) => n + 1), [])
  const answered = found?.d === d
  return { issue: missing && answered ? found.issue : undefined, reading: missing && !answered, reread }
}

/**
 * The deleted issues this reader can read, while `active` (SPEC §6.5): read
 * where they are drawn or counted, never on a load. `undefined` while the
 * read is in flight; empty where issues are not kept in order, where the
 * page's own load already holds every deleted one. `fresh` reads them anew
 * each time it turns active (the Archived tab, where someone else's delete
 * must show); otherwise the tab's one read is used (a key check). `failed`
 * when the read did not answer, which is not "none". `reload` reads them
 * again, after a Restore.
 */
export function useDeletedIssues(active: boolean, fresh = false): { deleted: Issue[] | undefined; failed: boolean; reload: () => void } {
  const [deleted, setDeleted] = useState<Issue[] | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    void (async () => {
      try {
        const issues = (await issueFieldsNow()) ? await readDeletedIssues(fresh || round > 0) : []
        if (live) {
          setDeleted(issues)
          setFailed(false)
        }
      } catch {
        if (live) {
          setDeleted([])
          setFailed(true)
        }
      }
    })()
    return () => {
      live = false
    }
  }, [active, fresh, round])
  const reload = useCallback(() => setRound((n) => n + 1), [])
  return { deleted, failed, reload }
}
