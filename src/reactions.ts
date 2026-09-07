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
 * How many targets one read asks about — the horizon, decided rather than
 * inherited (CON-1).
 *
 * §6.6's finding is that the choice is invisible: reactions on messages beyond
 * it simply do not appear, and **an undocumented cap is indistinguishable from
 * "nobody reacted"**. So the number is chosen from a measurement and named
 * after the decision.
 *
 * **Ship asks about every message on the page**, and this is a ceiling rather
 * than a routine truncation. Measured on production 2026-09-06:
 *
 * | page | messages |
 * | --- | --- |
 * | busiest issue | 13 |
 * | median issue | 2 |
 * | busiest project Folder | 77 |
 *
 * So 100 covers every surface this workspace has, with room. It is also the
 * reference client's N (§6.6) and Peek's `REACTION_TARGET_LIMIT`, which matters
 * more than it looks: CON-2 asks that the two apps agree on the count, and two
 * different horizons would make them disagree legitimately and unfixably.
 *
 * A page that exceeds it is truncated from the **oldest** end — the newest
 * messages are the ones being reacted to — and the caller is told how many it
 * left out, so the boundary is visible rather than silent.
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
