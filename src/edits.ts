/**
 * Edits — RFC 0.4 §7.2.1, CON-4.
 *
 * An edit never rewrites. A `kind:9` and a `kind:1111` are both
 * non-replaceable, so an edit is a separate `kind:40003` naming its target, and
 * what a reader shows as "edited" is a fold over the pair.
 *
 * ## Why this is not in `foldFolder`
 *
 * `foldFolder` is a contract between this repo and `estiva-agent`, held by
 * `scripts/conformance.test.ts` — which compares the recorded state walking the
 * **union of keys**, so any new field on `Message` turns both repos red at once.
 * An edit needs to be visible as an edit (a reader MUST mark it), which means a
 * field, which means it cannot live there.
 *
 * So this reads the raw events beside the fold, exactly as `references.ts` does
 * for tag-vs-body provenance. `parseMessage` returns null for any kind that is
 * not `9` or `1111`, so a `kind:40003` in the same stream is ignored by the
 * fold rather than mistaken for a message.
 *
 * ## Ordering, which is the only subtle part
 *
 * Latest edit wins, ordered `ts` (when trusted), then `created_at`, then event
 * `id` — the same ordering as SPEC §6.3, deliberately, because a second
 * ordering rule in the same protocol is a second thing to get wrong.
 *
 * **`ts` is honoured only when it agrees with `created_at` to the second**
 * (SPEC §6.2). That constraint is what keeps `ts` from being a new thing to
 * trust: the relay already bounds `created_at`, and a `ts` pinned inside an
 * already-validated second can only refine ordering *within* it. An edit
 * published without `ts` still folds, at one-second resolution.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { KIND } from './kinds'

/** The current text of an edited message, and when it was last changed. */
export interface Edit {
  body: string
  /** Milliseconds, so a reader can say when — `ts` where trusted, else seconds×1000. */
  at: number
}

/** Target event id → the edit that won. */
export type EditIndex = Record<string, Edit>

/**
 * The `ts` a reader may trust, in milliseconds, or the second as milliseconds.
 *
 * Rejects a `ts` disagreeing with `created_at` rather than preferring one:
 * a client whose clock is wrong by a minute would otherwise reorder a
 * conversation, and the relay validates only `created_at`.
 */
function orderingTime(event: SignedEvent): number {
  const raw = Number.parseInt(event.tags.find((t) => t[0] === 'ts')?.[1] ?? '', 10)
  if (Number.isFinite(raw) && Math.floor(raw / 1000) === event.created_at) return raw
  return event.created_at * 1000
}

/** Which of two edits is later — `ts`, then `created_at`, then id. */
function laterThan(a: SignedEvent, b: SignedEvent): boolean {
  const at = orderingTime(a)
  const bt = orderingTime(b)
  if (at !== bt) return at > bt
  if (a.created_at !== b.created_at) return a.created_at > b.created_at
  return a.id > b.id
}

/**
 * Fold `kind:40003` events into the current text of each target.
 *
 * Pure and event-shaped, so it runs in a test with no app around it — the same
 * constraint the rest of this work is under, and what lets it move into
 * `@estiva-app/conversation` (CON-5) rather than be rewritten there.
 *
 * An edit whose target this reader cannot see is **kept**, not dropped: the
 * target may arrive in a later read, and the caller looks edits up by id.
 */
export function foldEdits(events: readonly SignedEvent[]): EditIndex {
  const winners: Record<string, SignedEvent> = {}
  for (const event of events) {
    if (event.kind !== KIND.MESSAGE_EDIT) continue
    const target = event.tags.find((t) => t[0] === 'e')?.[1]
    if (!target) continue
    const held = winners[target]
    if (!held || laterThan(event, held)) winners[target] = event
  }

  const out: EditIndex = {}
  for (const [target, event] of Object.entries(winners)) {
    out[target] = { body: event.content, at: orderingTime(event) }
  }
  return out
}
