import { useCallback, useEffect, useState } from 'react'
import { reactionHorizon, type RootState } from '@estiva-app/conversation'
import { useRefresh } from '@/lib/useRefresh'
import { threadsOn, type ReactionsByTarget, type Resolution, type ThreadToRead } from './index'

type Read = { reactions: ReactionsByTarget; cut: boolean; resolved: Record<string, Resolution>; gone: Record<string, Exclude<RootState, 'present'>> }
const NOTHING: Read = { reactions: {}, cut: false, resolved: {}, gone: {} }

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
export function useReactions(threads: readonly ThreadToRead[]): {
  reactions: ReactionsByTarget
  /** How many messages were past the horizon and not asked about. */
  omitted: number
  /** Whether a read came back at the relay's page ceiling, so some reactions may be missing. */
  cut: boolean
  /** By thread id, each thread that stands resolved, by the resolution Peek or Leaf wrote (PEEK-128, SPEC §6.4). */
  resolved: Record<string, Resolution>
  /**
   * By thread id, each thread whose comment is gone (SPEC §6.5, ONE-9): `deleted` by its author, or `missing`, not
   * readable here. Absent until the read lands: a thread whose comment was not returned is then drawn as deleted,
   * which 3 of 3 such threads on production were (6 November).
   */
  gone: Record<string, Exclude<RootState, 'present'>>
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
  const { omitted } = reactionHorizon(threads.flatMap((thread) => thread.messages))
  const [read, setRead] = useState<Read | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  // The joined string rather than the array: a new array every render would
  // re-query on every keystroke in the composer above.
  const key = threads.map((t) => `${t.id}${t.gone ? '!' : ''}:${t.messages.map((m) => `${m.id}@${m.at}`).join(',')}`).join(';')

  const load = useCallback(() => {
    if (threads.length === 0) {
      setRead(NOTHING)
      return undefined
    }
    let cancelled = false
    threadsOn(threads)
      .then(({ reactions, cut, resolved, gone }) => {
        if (!cancelled) setRead({ reactions, cut, resolved, gone })
      })
      .catch(() => {
        // A failed reaction read is not a failed page. The conversation is
        // already on screen and correct; saying "could not load reactions"
        // over it would report a working app as broken, and the next refresh
        // is a moment away.
        if (!cancelled) setRead((held) => held ?? NOTHING)
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
    resolved: read?.resolved ?? {},
    gone: read?.gone ?? {},
    loading: read === undefined,
    refresh: () => setNonce((n) => n + 1),
  }
}
