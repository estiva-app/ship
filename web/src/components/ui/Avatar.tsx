import { IconUserFilled } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/**
 * A person's face. `@estiva/ui` candidate (SHA-5) — no product knowledge here.
 *
 * **This component cannot render a key, and that is its whole point.** It takes
 * a name and a picture — both from `kind:0`, both absent for most people — and
 * where there is nothing it draws a silhouette. There is deliberately no
 * `pubkey` prop: a component that accepted one would eventually show one.
 *
 * That is a divergence from the data layer's own `initials(profile, pubkey)`
 * (`src/profiles.ts`), which falls back to the first two hex characters of the
 * key, and from the old app's `avatar()`, which additionally hangs the full key
 * in the `title`. Both predate the ruling; `src/` is vendored into estiva-agent
 * and is not ours to change, so the UI simply does not call that helper.
 *
 * Initials are light text on the accent tint (her ruling, 2026-08-24) rather
 * than the old app's per-key hue — a colour derived from a key is a key, dimly.
 *
 * They are drawn as SVG text so the *capitals* sit on the centre line: HTML
 * text centres its line box, and Geist's caps stand on a baseline a fifth of
 * an em above the box bottom, which read as "too high" at every size
 * (Katerina, 2026-08-25). Cap height is 0.70 em, so the baseline goes 0.35 em
 * below centre.
 */
export interface AvatarProps {
  /** From `kind:0`. Absent means anonymous — a silhouette, never a key. */
  name?: string
  /** `kind:0` picture URL, rendered as-is. */
  src?: string
  /** Pixels. 22 in the header, 20 in a row, 36 on a card. */
  size?: number
  className?: string
}

/**
 * Initials from a *name*: two words give two letters, one word gives two of
 * its letters, nothing gives nothing. The no-name case returns empty rather
 * than a placeholder glyph, and the caller draws the silhouette.
 */
export function initialsFromName(name: string | undefined): string {
  const words = name?.split(/\s+/).filter(Boolean) ?? []
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return ''
}

const CAP_HEIGHT_EM = 0.7

export function Avatar({ name, src, size = 22, className }: AvatarProps) {
  const initials = initialsFromName(name)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-accent-muted text-text-primary',
        className,
      )}
      style={{ width: size, height: size }}
      /* The name is already beside the face wherever this is used, so the
         picture is decorative and takes no alt text of its own. */
      aria-hidden="true"
    >
      {initials ? (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="font-sans font-medium">
          <text
            x="50%"
            y="50%"
            dy={`${CAP_HEIGHT_EM / 2}em`}
            textAnchor="middle"
            fontSize={Math.round(size * 0.42)}
            fill="currentColor"
          >
            {initials}
          </text>
        </svg>
      ) : (
        <IconUserFilled size={Math.round(size * 0.58)} className="text-text-muted" />
      )}
      {/* Picture on top of the initials rather than instead of them: a URL that
          404s reveals a filled avatar rather than a hole. `onError` hides it
          for good — the old app removed the node for the same reason. */}
      {src && (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      )}
    </span>
  )
}
