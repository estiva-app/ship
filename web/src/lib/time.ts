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
