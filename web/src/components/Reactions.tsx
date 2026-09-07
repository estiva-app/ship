import { Chip } from '@/components/ui/Chip'
import { WithTooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import type { Reaction } from '@/api'

/**
 * The reactions on one message — CON-2.
 *
 * ## Read-only, and that is why these are Chips
 *
 * `Chip`'s page is explicit that *"something clickable → Button (small) or
 * MenuItem — a Chip is not a control"*, and it would be the wrong component for
 * a reaction you can add. Ship cannot add one: the `estiva-ship` credential's
 * `allowedKinds` is
 * `[30850, 30851, 1851, 9, 5, 9007, 31989, 27235, 1111, 30078]` — no `7` —
 * while `estiva-peek` has it. So a reaction here is standing information about
 * what happened elsewhere, which is exactly Chip's *When*: a count with no
 * verdict attached.
 *
 * **When the grant lands these become controls, and a Chip stops being right.**
 * At that point they want the package's `Reaction` — which does not exist yet,
 * and which Peek currently forks (`Reaction.tsx` re-types Chip's class list
 * with a border, the example UI-RULES §1 names). Building a second hand-rolled
 * pill here to get ahead of that would make it two forks instead of one.
 *
 * ## What a reader can tell from this
 *
 * The count, the emoji, and — in the tooltip — who. Not *whether you reacted*:
 * the fold carries that (`mine`), and drawing it would promise a control that
 * is not there. An honest read-only surface says what other people did.
 */
export function Reactions({
  reactions,
  nameOf,
  className,
}: {
  reactions: readonly Reaction[] | undefined
  /** Resolve a reactor's key to a name — the workspace directory's. */
  nameOf?: (pubkey: string) => string
  className?: string
}) {
  if (!reactions?.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} data-reactions={String(reactions.length)}>
      {reactions.map((reaction) => (
        <WithTooltip key={reaction.emoji} label={reactorLabel(reaction, nameOf)}>
          {/* The emoji rides in `leadingIcon`, whose slot centres it so it does
              not sit on the label's baseline; the label is the count, which the
              page says works on its own. */}
          <span>
            <Chip
              type="neutral"
              leadingIcon={<span aria-hidden="true">{reaction.emoji}</span>}
              label={String(reaction.count)}
            />
          </span>
        </WithTooltip>
      ))}
    </div>
  )
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
