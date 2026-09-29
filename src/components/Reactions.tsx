import { Chip } from '@/components/ui/Chip'
import { Reaction as ReactionPill } from '@/components/ui/Reaction'
import { WithTooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { REACTION_EMOJI, type Reaction } from '@/api'

/**
 * The palette as the package's `ReactionPicker` takes it: each emoji with the
 * word for it. The vocabulary is Ship's (D31, 2026-09-08); the picker that
 * shows it is the package's, opened from the message's tools.
 */
export const REACTION_OPTIONS = REACTION_EMOJI.map(({ emoji, name }) => ({ emoji, label: name }))

/**
 * The reactions on one message — CON-2.
 *
 * ## These were Chips, and the grant is why they are not any more
 *
 * Ship could not sign a `kind:7` until 2026-09-07 — `estiva-ship`'s
 * `allowedKinds` had no `7` while `estiva-peek` did — so a reaction here was
 * standing information about what happened elsewhere, which is Chip's *When*.
 * estiva-id#59 granted it, the row was re-seeded and verified, and a reaction
 * is now a control. Chip's page rules itself out for those: *"something
 * clickable → Button (small) or MenuItem — a Chip is not a control."*
 *
 * ## Adopted `@estiva-app/ui` 0.7.0
 *
 * The counted pill is the package's `Reaction` since 0.7.0. Ship drew it as a
 * small `Button` before that — legible, and measured at a 1px hairline against
 * no border for "yours", where the package component gives it the accent's
 * tint and edge. That gap is what the component was added for.
 *
 * ## Which package components, and why those
 *
 * Both answers are the packages' own *When not* lines rather than a preference:
 *
 * - **The picker is not here any more** (0.10.0, D34). It is the package's
 *   `ReactionPicker`, opened from the "React" button among the message's
 *   tools and drawn above it, the way Peek's card does it. This row is the
 *   answer — the pills — and it draws nothing when there is none to show.
 * - **A reaction with a count is a small `Button`.** `IconButton`'s page: *"The
 *   action deserves a visible label → Button (words are cheaper than a guessed
 *   icon)"*, and a count is a visible label an icon-only control has no slot
 *   for.
 *
 * **A pill is still what this wants**, and the package has none. `Reaction` is
 * proposed to `@estiva-app/ui` — it would also retire Peek's fork of it (a
 * fork as .claude/rules/ship-ui.md defines one). Until it ships, these are the package's
 * real components rather than a second hand-rolled pill, and this file collapses
 * onto it when it lands.
 *
 * ## Your own reaction is visibly yours
 *
 * `outlined` when you are among the reactors, `muted` otherwise — the fold
 * carries `mine` for exactly this, and it is also the id a retraction targets.
 * Clicking your own takes it back; clicking anyone else's adds yours.
 */
export function Reactions({
  reactions,
  nameOf,
  onToggle,
  disabledReason,
  labelOf = reactorLabel,
  className,
}: {
  reactions: readonly Reaction[] | undefined
  /** Resolve a reactor's key to a name — the workspace directory's. */
  nameOf?: (pubkey: string) => string
  /**
   * Add this emoji, or take back the reaction whose id is given.
   *
   * One handler for both, because to a reader it is one gesture: clicking a
   * reaction toggles yours. The caller knows which write that is from whether
   * `mine` came back.
   */
  onToggle?: (emoji: string, mine?: string) => void
  /** Why nothing can be written right now — every control here is disabled with it. */
  disabledReason?: string
  /** The words on a pill's tooltip. Today's: "Ana and Ravi reacted with 👍". */
  labelOf?: (reaction: Reaction, nameOf?: (pubkey: string) => string) => string
  className?: string
}) {
  const existing = reactions ?? []
  // Nothing to show: draw nothing rather than an empty row under every message
  // in every thread. Offering a reaction is the message's tools' job (D34).
  if (!existing.length) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} data-reactions={String(existing.length)}>
      {existing.map((reaction) => {
        /*
          Two shapes, and each page asks for its own.

          Without a handler nobody may ever react here — a signed-out reader —
          and Button's page is explicit that "a control the person may never be
          allowed to use is absent, not disabled". So the reaction becomes what
          it actually is in that state: standing information, which is Chip's
          own *When*. `disabledReason` is the other case — momentarily
          unavailable, which is exactly what `disabled` plus a tooltip is for.
        */
        if (!onToggle) {
          return (
            <WithTooltip key={reaction.emoji} label={labelOf(reaction, nameOf)}>
              <span>
                <Chip
                  type="neutral"
                  leadingIcon={<span aria-hidden="true">{reaction.emoji}</span>}
                  label={String(reaction.count)}
                />
              </span>
            </WithTooltip>
          )
        }
        const button = (
          <ReactionPill
            emoji={reaction.emoji}
            count={reaction.count}
            pressed={!!reaction.mine}
            disabled={!!disabledReason}
            onClick={() => onToggle(reaction.emoji, reaction.mine)}
            /*
              The package requires this, and the reason is Ship's own bug: the
              emoji is `aria-hidden` and the count is the only visible text, so
              without a name the control is announced as "1". Caught here by a
              test, then made unskippable by making the prop required.
            */
            aria-label={`${reactionName(reaction.emoji)}, ${reaction.count}`}
          />
        )
        return (
          <WithTooltip key={reaction.emoji} label={disabledReason ?? labelOf(reaction, nameOf)}>
            <span>{button}</span>
          </WithTooltip>
        )
      })}

    </div>
  )
}

/**
 * What an emoji means, for a control that has to be named.
 *
 * Falls back to the glyph itself for anything outside the shared palette —
 * another client can publish any emoji, and a reaction Ship cannot name is
 * still one it must draw rather than hide.
 */
export function reactionName(emoji: string): string {
  return REACTION_EMOJI.find((e) => e.emoji === emoji)?.name ?? emoji
}

/**
 * "Ana and Ravi reacted with 👍" — the names, not the keys.
 *
 * A key nobody has a profile for stays a shortened key rather than becoming
 * "unknown": an anonymous participant is anonymous, which is the same rule
 * `profiles.ts` keeps everywhere else in this app.
 */
export function reactorLabel(reaction: Reaction, nameOf?: (pubkey: string) => string): string {
  const names = reaction.by.map((pubkey) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`)
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who} reacted with ${reaction.emoji}`
}
