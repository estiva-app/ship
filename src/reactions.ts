/**
 * Reactions — SPEC §6.6, CON-2.
 *
 * A reaction is a `kind:7` whose `content` is the emoji and whose `e` tag names
 * the event reacted to. Retracting one is a `kind:5` naming the reaction's own
 * event id — no `h` on either, because Buzz derives the channel from the target
 * (`build_reaction` and `build_remove_reaction`, `builders.rs`).
 *
 * ## Why reactions cannot be read the way everything else is
 *
 * **A `kind:7` carries no `h` tag.** Every other event this app reads is found
 * by Folder; reactions cannot be, so they are fetched *addressed by target*:
 * collect the event ids on screen, ask for reactions pointing at them. That is
 * the whole of §6.6, and it is what forces a horizon.
 *
 * Measured against production before choosing one (2026-09-06): the `#e` filter
 * **does OR an array of targets**, so one query covers a page. That is worth
 * stating because the workspace's known relay quirk says the opposite for `#h`
 * — `{'#h': [A, B]}` silently returns only A's events — and over-generalising it
 * would have produced one round trip per message, 588 of them for a workspace
 * read. It was checked rather than assumed: two targets asked for, two answered.
 *
 * ## No deletion query, deliberately
 *
 * Peek fetches `kind:5` alongside reactions because it *caches* them in Convex
 * and has to retract its own copy. Ship caches nothing — every read is a fresh
 * query — and the relay stops returning an event once it holds a deletion for
 * it. So a retracted reaction is simply absent from the next read, and asking
 * about deletions would be a round trip for an answer already given.
 *
 * ## Reactions attach to messages, and this file does not decide otherwise
 *
 * RFC 0.4 §7.2 settles that reactions belong to messages rather than to blocks.
 * Whether they attach to *objects* — an issue, a project — is explicitly not
 * settled, and CON-2 says not to decide it here. Nothing below can express an
 * object reaction: the target is an event id, and an issue does not have one.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { KIND } from './kinds'

/**
 * How many targets one read asks about — **SPEC §6.6's horizon, adopted**.
 *
 * ## The direction of this changed, and that is the point
 *
 * This used to say the number was "chosen from a measurement" here, and that it
 * "is also the reference client's N (§6.6)" — the spec describing whatever this
 * constant happened to say. CON-1 asked for the opposite, and estiva-docs#76
 * settled it: **§6.6 fixes N at 100 as a rule, and this adopts it.** If the two
 * ever disagree, this one is wrong.
 *
 * That is not pedantry about where a number lives. A horizon is not a private
 * tuning constant: two apps showing the same conversation with different N
 * **disagree about the count, legitimately and unfixably**, and a reader has no
 * way to tell that from a bug. Its being the same everywhere matters far more
 * than its value, which is exactly why it belongs in the specification and not
 * in whichever app was written first.
 *
 * ## The measurements behind the rule
 *
 * Kept because a reader deciding whether 100 still fits needs them, and §6.6
 * carries the same table. Production, 2026-09-06/07:
 *
 * | surface | messages |
 * | --- | --- |
 * | busiest container | 77 |
 * | median container | 9 |
 * | busiest issue | 13 |
 * | containers at or over 100 | 0 |
 *
 * A surface routinely exceeding this wants the question raised in §6.6 rather
 * than this constant quietly raised.
 *
 * ## What Ship does with it
 *
 * **Asks about every message on the page**, so this is a ceiling rather than a
 * routine truncation. A page that exceeds it is truncated from the **oldest**
 * end — the newest messages are the ones being reacted to — and the caller is
 * told how many were left out, which §6.6 now requires rather than suggests.
 */
export const REACTION_TARGET_LIMIT = 100

/**
 * How many reaction events one read will accept.
 *
 * Separate from the target limit and larger: one target may carry many
 * reactions, so bounding targets does not bound events. 500 is well above
 * anything this workspace has produced (5 reactions in total on 2026-09-06) and
 * exists so a pathological thread cannot turn one page into an unbounded read.
 */
export const REACTION_EVENT_LIMIT = 500

/**
 * The emoji a person can pick, and what each one means.
 *
 * **Deliberately the same five Peek offers**, in the same order — Peek's
 * `REACTION_NAMES` (`src/components/ui/Reaction.tsx`). Two apps writing to one
 * relay with different palettes would produce a workspace where a reaction you
 * can read is one you cannot answer, which is the sort of divergence the
 * projection layer exists to prevent.
 *
 * The names are the tooltips. A bare glyph is not self-explanatory — "🙏" reads
 * as thanks to one person and as a plea to another — and the label is also the
 * accessible name, which an icon-only control has no other source for.
 *
 * This belongs in the conversation package with the rest of the model. It is
 * here until that exists, and the duplication is recorded rather than silent.
 */
export const REACTION_EMOJI: readonly { emoji: string; name: string }[] = [
  { emoji: '👍', name: 'Makes sense' },
  { emoji: '💯', name: 'Agree' },
  { emoji: '🙏', name: 'Thank you' },
  { emoji: '🚀', name: "Let's go!" },
  { emoji: '🎉', name: 'Congrats' },
]

/** One emoji on one target, and who put it there. */
export interface Reaction {
  emoji: string
  /** Distinct reactors. A pubkey reacting twice with the same emoji counts once. */
  count: number
  /** Reactor pubkeys, in the order they reacted. */
  by: string[]
  /**
   * The viewer's own reaction event id, when they are among `by`.
   *
   * Carried because retracting is a `kind:5` naming *the reaction*, not the
   * message — so a UI that offers "click again to remove" needs this id and has
   * nowhere else to get it.
   */
  mine?: string
}

/** Target event id → its reactions, most reacted first. */
export type ReactionsByTarget = Record<string, Reaction[]>

/**
 * Which targets to ask about, and what was left out — the horizon applied.
 *
 * Returns the ids in the order given, keeping the **last** `REACTION_TARGET_LIMIT`
 * of them. The caller passes messages oldest-first, so what survives is the
 * recent end of the conversation, which is where reactions are.
 */
export function reactionTargets(eventIds: readonly string[]): {
  targets: string[]
  omitted: number
} {
  const unique = [...new Set(eventIds)]
  if (unique.length <= REACTION_TARGET_LIMIT) return { targets: unique, omitted: 0 }
  return {
    targets: unique.slice(unique.length - REACTION_TARGET_LIMIT),
    omitted: unique.length - REACTION_TARGET_LIMIT,
  }
}

/**
 * Fold `kind:7` events into per-target counts.
 *
 * Pure, and takes the viewer rather than reading one, so it runs in a test with
 * no app around it — one of CON-2's extraction constraints, and what makes this
 * file movable into the conversation package rather than rewritable.
 */
export function foldReactions(
  events: readonly SignedEvent[],
  /** The viewer's pubkey, so `mine` can be filled. */
  viewer?: string,
): ReactionsByTarget {
  const out: ReactionsByTarget = {}
  /* Oldest first, so `by` reads in the order people reacted and the first
     reactor of an emoji is the one who introduced it. The relay does not
     promise an order. */
  const ordered = [...events].sort((a, b) => a.created_at - b.created_at)

  for (const event of ordered) {
    if (event.kind !== KIND.REACTION) continue
    const emoji = event.content.trim()
    // An empty reaction is NIP-25's "like" and has nothing to draw. Skipping it
    // is better than inventing a glyph the author did not choose.
    if (!emoji) continue
    const target = event.tags.find((t) => t[0] === 'e')?.[1]
    if (!target) continue

    const list = (out[target] ??= [])
    let reaction = list.find((r) => r.emoji === emoji)
    if (!reaction) {
      reaction = { emoji, count: 0, by: [] }
      list.push(reaction)
    }
    // A pubkey reacting twice with the same emoji counts once — a double publish
    // is a duplicate, not two people. The first one wins, so `mine` names the
    // event a retraction should target.
    if (reaction.by.includes(event.pubkey)) continue
    reaction.by.push(event.pubkey)
    reaction.count += 1
    if (viewer && event.pubkey === viewer) reaction.mine = event.id
  }

  // Most reacted first, ties broken by who got there first — a stable order, so
  // a reaction being added does not reshuffle the ones already on screen.
  for (const list of Object.values(out)) list.sort((a, b) => b.count - a.count)
  return out
}
