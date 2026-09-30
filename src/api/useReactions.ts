import { useCallback, useEffect, useState } from 'react'
import { reactionHorizon } from '@estiva-app/conversation'
import { useRefresh } from '@/lib/useRefresh'
import { reactionsOn, type ReactionsByTarget } from './index'

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
 * ## The horizon is applied by the read, and reported
 *
 * `@estiva-app/conversation`'s `decorationsOf` asks about the newest 100
 * targets by `created_at` (§6.6, CON-5) and says how many it left out, and
 * whether the relay may hold reactions the read did not bring back. The caller
 * shows both, because §6.6's finding is that a cap is otherwise invisible — a
 * message past it looks exactly like a message nobody reacted to. `omitted` is
 * known before the read lands, so it is computed here too.
 *
 * ## Freshness
 *
 * `useRefresh`, like every other view in this app: `REFRESH_MS` while visible,
 * on focus, never in a hidden tab. So a reaction added in Peek shows up here on
 * the same cadence the rest of the page does, rather than needing a reload —
 * which is the whole cross-app claim CON-2 is about.
 */
export function useReactions(targets: readonly { id: string; at: number }[]): {
  reactions: ReactionsByTarget
  /** How many messages were past the horizon and not asked about. */
  omitted: number
  /** Whether a read came back at the relay's page ceiling, so some reactions may be missing. */
  cut: boolean
  /** The first read has not landed yet. Distinct from "nobody reacted". */
  loading: boolean
  /**
   * Re-read now, rather than waiting for the poll.
   *
   * A write goes to the relay and the pill updates from the next read, so
   * without this a click would sit unchanged until the next refresh and read as
   * a control that did nothing. The relay stays the authority — this asks it
   * again rather than patching local state optimistically, which is the same
   * rule `act` keeps for every other write in this app.
   */
  refresh: () => void
} {
  const { omitted } = reactionHorizon(targets)
  const [read, setRead] = useState<{ reactions: ReactionsByTarget; cut: boolean } | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  // The joined string rather than the array: a new array every render would
  // re-query on every keystroke in the composer above.
  const key = targets.map((t) => `${t.id}@${t.at}`).join(',')

  const load = useCallback(() => {
    if (targets.length === 0) {
      setRead({ reactions: {}, cut: false })
      return undefined
    }
    let cancelled = false
    reactionsOn(targets)
      .then(({ reactions, cut }) => {
        if (!cancelled) setRead({ reactions, cut })
      })
      .catch(() => {
        // A failed reaction read is not a failed page. The conversation is
        // already on screen and correct; saying "could not load reactions"
        // over it would report a working app as broken, and the next refresh
        // is a moment away.
        if (!cancelled) setRead((held) => held ?? { reactions: {}, cut: false })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => load(), [key, nonce, load])
  useRefresh(() => setNonce((n) => n + 1))

  return {
    reactions: read?.reactions ?? {},
    omitted,
    cut: read?.cut ?? false,
    loading: read === undefined,
    refresh: () => setNonce((n) => n + 1),
  }
}
