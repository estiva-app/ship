import type { WriteResult } from '@/api'
import { isRateLimited, retryHintMs } from '@/lib/relayBudget'

export type Say = (text: string, tone?: 'ok' | 'error') => void

/**
 * Every write the pages make goes through here — the old app's `publish`:
 * a refusal is said with its reason ("<what> rejected — …"), and a success
 * is followed by a re-read of the workspace, so what the page shows next is
 * what the relay holds, never what the UI hoped. Resolves whether it worked,
 * which is what an editable field or a dialog needs to know.
 *
 * ## The re-read is optional, and a reaction is why
 *
 * `refresh` is `loadAll`, and `loadAll` costs **one bridge request per Folder**
 * — 38 of them against production on 2026-09-07, for 34 Folders. That is the
 * right price for a write whose result lives in the fold: a comment, a status,
 * an assignee. It is the wrong price for one whose result does not.
 *
 * **A reaction is not in the fold at all.** `kind:7` carries no `h`, so it is
 * never part of a Folder read and nothing `loadAll` returns can change because
 * somebody reacted. Re-reading the workspace on every click spent 38 requests
 * to learn nothing, against a budget of 300 a minute that is shared with Peek
 * and with every other tab signed in as the same person — which is how a
 * reaction in Ship produced `rate-limited: quota exceeded` in Peek's console.
 *
 * So a caller whose result is not in the fold passes no `refresh` and refreshes
 * whatever actually changed. The reaction surface re-reads its own `kind:7`
 * query, which is one request.
 */
export async function act(
  what: string,
  write: () => Promise<WriteResult>,
  say: Say,
  /** Omitted when nothing in the fold can have changed — see above. */
  refresh?: () => Promise<void>,
  /** The words for a refusal, where the default "<what> rejected — <reason>" is not what the person should read. */
  refused?: (reason: string) => string,
): Promise<boolean> {
  const result = await write()
  if (!result.ok) {
    /*
      A quota refusal is not a rejection and must not read as one — SHI-12
      established that for reads and the same is true here. "Reaction rejected
      — rate-limited: quota exceeded; retry in 14s" describes a working relay
      declining to answer *right now* as though it had judged the message and
      said no. The relay tells us how long it wants; say that instead.
    */
    if (isRateLimited(result.reason)) {
      const wait = retryHintMs(result.reason)
      say(wait ? `Too busy right now — try again in ${Math.ceil(wait / 1000)}s.` : 'Too busy right now — try again shortly.', 'error')
      return false
    }
    say(refused ? refused(result.reason) : `${what} rejected — ${result.reason}`, 'error')
    return false
  }
  await refresh?.()
  return true
}
