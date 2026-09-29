import { Kbd } from '@estiva-app/ui'
import { cn } from '@/lib/cn'

// @estiva-escape(no-copied-look): Peek's writing box, the same look in Ship; one package part for both apps is an estiva-ui candidate awaiting Katerina's call (30 September)
export const WRITING_BOX = 'relative bg-bg-inset border border-border-default rounded-lg p-3 flex gap-2 transition-colors focus-within:border-border-strong'

/**
 * The writing box before its editor has loaded, drawn at the size it will be:
 * the tall box for a new conversation, the 38px line for a reply. It says
 * what the box says, and cannot be typed in yet.
 */
export function MessageBoxShell({ kind, reason, className }: { kind: 'conversation' | 'reply'; reason?: string; className?: string }) {
  const words = reason ?? (kind === 'reply' ? 'Reply…' : null)
  return (
    <div className={cn('flex flex-col gap-1', className)} aria-hidden>
      <div className={kind === 'conversation' ? cn(WRITING_BOX, 'flex-col gap-4') : cn(WRITING_BOX, 'items-center py-1.5 pl-3 pr-1.5')}>
        <div className="flex min-h-6 items-center gap-1 py-0.5 text-body-2 text-text-muted">
          {words ?? (
            <>
              <span>Start a conversation or type</span>
              <Kbd>/</Kbd>
              <span>for commands</span>
            </>
          )}
        </div>
        {kind === 'conversation' && <div className="h-6" />}
      </div>
    </div>
  )
}
