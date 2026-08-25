import { useRef, useState, type KeyboardEvent } from 'react'
import { IconArrowUp } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/**
 * Peek's ComposeBox — the SHELL of it (2026-08-26). `@estiva/ui` candidate
 * as a shell.
 *
 * Peek's composer is a rich editor: mentions, highlights, slash commands,
 * file uploads through Convex. That is Peek's product, not a primitive. What
 * is shared is the frame around it, kept exactly: the inset panel with a
 * hairline border that strengthens while focused, the text area with its
 * placeholder, a toolbar row underneath with the accent send button at the
 * right, Enter to send and Shift+Enter for a new line, the hint that says so.
 *
 * Ship's messages are plain text (a `kind:9` / `kind:1111` body), so the
 * editable area is a plain, auto-growing text area. Replies pass the reply
 * placeholder. A draft surviving navigation is the caller's job, and still
 * to do (audit C5).
 */
export interface ComposeBoxProps {
  /** Called with the trimmed text. Not called for an empty message. */
  onSend?: (text: string) => void
  placeholder?: string
  /** Something on the left of the toolbar — attach, and the like. */
  tools?: React.ReactNode
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export function ComposeBox({
  onSend,
  placeholder = 'Write a message…',
  tools,
  disabled = false,
  autoFocus = false,
  className,
}: ComposeBoxProps) {
  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0 && !disabled

  const grow = () => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }

  const send = () => {
    if (!canSend) return
    onSend?.(text.trim())
    setText('')
    requestAnimationFrame(grow)
    areaRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border-default bg-bg-inset p-3 transition-colors focus-within:border-border-strong',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <textarea
        ref={areaRef}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          setText(event.target.value)
          grow()
        }}
        onKeyDown={onKeyDown}
        className="min-h-[20px] w-full resize-none break-words bg-transparent text-sm leading-[1.4] text-text-primary outline-none placeholder:text-text-muted"
        style={{ caretColor: 'var(--text-primary)' }}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">{tools}</div>
        <div className="flex items-center gap-2.5">
          <span className="select-none font-mono text-[9px] tracking-[0.04em] text-text-muted">
            Enter to send · Shift+Enter new line
          </span>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              send()
            }}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              'flex items-center justify-center rounded-lg p-1 transition-colors',
              canSend ? 'cursor-pointer bg-accent-primary text-text-inverse hover:bg-accent-hover' : 'pointer-events-none bg-bg-disabled text-text-disabled',
            )}
          >
            <IconArrowUp size={16} stroke={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
