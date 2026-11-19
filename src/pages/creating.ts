import { useRef } from 'react'
import type { CreateResult, Unfinished } from '@/api'
import type { Say } from './act'

/**
 * A create dialog's answer where a new file's text is its first change (SPEC
 * §6.1): created, refused, or created without its text. That last one is held
 * while the dialog stays open with the person's words, and Create again sends
 * the rest with it, never a second file; it says "created" only once the text
 * has landed. Closing the dialog lets it go: the file stays, with no text.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-new-files-text-is-its-first-change.md
 */
export function useUnfinished(what: 'Issue' | 'Project') {
  const held = useRef<Unfinished | undefined>(undefined)
  return {
    /** The creation Create again finishes, if one is waiting. */
    held: () => held.current,
    /** The dialog closed. */
    forget: () => {
      held.current = undefined
    },
    /** Says a refusal and keeps an unfinished creation; true when it was created whole. */
    landed(result: CreateResult, say: Say): result is Extract<CreateResult, { ok: true }> {
      if (result.ok) {
        held.current = undefined
        return true
      }
      if (result.unfinished) {
        held.current = result.unfinished
        // The relay's reason is a code, not words for a person; where it went wrong is.
        say(result.elsewhere ? result.reason : `${what} created, but its description didn't save. Create again to send it.`, 'error', 'not-created')
        return false
      }
      say(`${what} rejected — ${result.reason}`, 'error', 'not-created')
      return false
    },
  }
}
