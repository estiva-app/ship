import { useCallback, useEffect, useState } from 'react'
import { reactionTargets, type ReactionsByTarget } from '../../../src/reactions'
import { useRefresh } from '@/lib/useRefresh'
import { reactionsOn } from './index'

/**
 * The reactions on a set of messages — CON-2.
 *
 * A second read, separate from `loadAll`, and it has to be: a `kind:7` carries
 * no `h` tag, so reactions cannot come back with the Folder the way everything
 * else does. They are fetched addressed by target instead (SPEC §6.6).
 *
 * Keeping it out of `loadAll` is deliberate rather than incidental. `loadAll`
 * pulls the whole workspace and folds it on every call, and it takes ~1.4 s
 * against production; reactions are a property of the page, so they are asked
 * for per page and cost the workspace read nothing.
 *
 * ## The horizon is applied here, and reported
 *
 * `reactionTargets` caps the ids and says how many it dropped. The caller shows
 * that, because §6.6's finding is that the cap is otherwise invisible — a
 * message past it looks exactly like a message nobody reacted to.
 *
 * ## Freshness
 *
 * `useRefresh`, like every other view in this app: `REFRESH_MS` while visible,
 * on focus, never in a hidden tab. So a reaction added in Peek shows up here on
 * the same cadence the rest of the page does, rather than needing a reload —
 * which is the whole cross-app claim CON-2 is about.
 *
 * Named rather than quoted: the interval has moved twice (5 s → 10 s → 20 s),
 * and comments that spelled the old number out stayed behind each time.
 */
export function useReactions(eventIds: readonly string[]): {
  reactions: ReactionsByTarget
  /** How many messages were past the horizon and not asked about. */
  omitted: number
  /** The first read has not landed yet. Distinct from "nobody reacted". */
  loading: boolean
  /**
   * Re-read now, rather than waiting for the poll.
   *
   * A write goes to the relay and the pill updates from the next read, so
   * without this a click would sit unchanged for up to five seconds and read as
   * a control that did nothing. The relay stays the authority — this asks it
   * again rather than patching local state optimistically, which is the same
   * rule `act` keeps for every other write in this app.
   */
  refresh: () => void
} {
  const { targets, omitted } = reactionTargets(eventIds)
  const [reactions, setReactions] = useState<ReactionsByTarget | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  // The joined string rather than the array: a new array every render would
  // re-query on every keystroke in the composer above.
  const key = targets.join(',')

  const read = useCallback(() => {
    if (targets.length === 0) {
      setReactions({})
      return undefined
    }
    let cancelled = false
    reactionsOn(targets)
      .then((found) => {
        if (!cancelled) setReactions(found)
      })
      .catch(() => {
        // A failed reaction read is not a failed page. The conversation is
        // already on screen and correct; saying "could not load reactions"
        // over it would report a working app as broken, and the next refresh
        // is five seconds away.
        if (!cancelled) setReactions((held) => held ?? {})
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => read(), [key, nonce, read])
  useRefresh(() => setNonce((n) => n + 1))

  return { reactions: reactions ?? {}, omitted, loading: reactions === undefined, refresh: () => setNonce((n) => n + 1) }
}
