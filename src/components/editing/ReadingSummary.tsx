import { cn } from '@/lib/cn'

/**
 * A file's summary under its title as text: for someone who cannot change it
 * (no rights, or an archived file), and for a writer in the moment before the
 * editors arrive. Drawn exactly as `LiveSummary`'s text is, the package's
 * `InlineText` in its summary variant, so nothing moves when it is replaced.
 *
 * With no summary, a reader sees nothing at all; a writer who is waiting sees
 * the quiet "Add a summary" the editor will show. It imports no editor, so a
 * reader never downloads one.
 */
export function ReadingSummary({ value, waiting = false }: { value: string; waiting?: boolean }) {
  if (!value && !waiting) return null
  return <p className={cn('-mx-2 px-2 py-1 text-body-1', value ? 'text-text-secondary' : 'text-text-muted')}>{value || 'Add a summary'}</p>
}
