/**
 * Relative time, copied from the old app's `ago()` (apps/ship/ui.ts) so a
 * card reads the same "1d ago" in both apps until the cutover. Seconds in,
 * as the relay keeps them.
 */
export function ago(seconds: number, now: number = Date.now()): string {
  const delta = Math.max(0, now / 1000 - seconds)
  if (delta < 60) return 'just now'
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  if (delta < 604800) return `${Math.floor(delta / 86400)}d ago`
  return new Date(seconds * 1000).toLocaleDateString()
}

/** The day something happened, as the kit's notices draw it: "Today", or "Mon, Nov 2". Seconds in. */
export function day(seconds: number, now: number = Date.now()): string {
  const at = new Date(seconds * 1000)
  if (at.toDateString() === new Date(now).toDateString()) return 'Today'
  return at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/**
 * When something last happened, as Explore initiatives' Active says it in every app — Peek's `formatActive`, word for
 * word (Katerina, 18 November: "just like in Peek"): `'Just now'`, `'5 minutes ago'`, `'Yesterday'`, `'Last week'`,
 * `'3 months ago'`. Milliseconds in, as Peek's.
 */
export function formatActive(at: number, now: number = Date.now()): string {
  let amount = (at - now) / 60_000
  if (amount > -1) return 'Just now'
  for (const [unit, next] of RELATIVE_STEPS) {
    // Rounded before the unit is chosen: 59.6 minutes is "1 hour ago", not "60 minutes ago".
    if (Math.abs(Math.round(amount)) < next) {
      const said = RELATIVE.format(Math.round(amount), unit)
      return said.charAt(0).toUpperCase() + said.slice(1)
    }
    amount /= next
  }
  return ''
}

/** "Katerina, 2h ago": who edited a file last, by first name, and when — Ship's words on an initiative's rows (the prototype's, Miky 4 Nov), kept on every list's When (Katerina, 23 November). */
export function editedLabel(name: string, at: number, now: number = Date.now()): string {
  return `${name.split(' ')[0]}, ${ago(at, now)}`
}
