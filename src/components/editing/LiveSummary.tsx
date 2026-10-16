import { useRef, useState, type Ref } from 'react'
import { FieldLine } from '@estiva-app/ui'
import { InlineText, type InlineTextHandle } from '@estiva-app/ui/editor'
import { SummaryCount } from '@/components/SummaryField'
import { summaryText } from '@/nostr/summary'

/**
 * A file's summary under its title on its own page, edited where it stands, as in a document: all of it, with a count past about 240 and a refused save said under it.
 *
 * - **Editing feels like a document, not a form** (Miky, 16 October, after
 *   seeing the first build on production): the text stays where it is, in the
 *   same size and colour, and becomes editable. No box, no jump in layout, no
 *   form chrome. The package's `InlineText`, as the title above it is: click
 *   anywhere in it and type. Enter saves and goes on into the description;
 *   Escape or leaving saves too. Empty, it says "Add a summary", quietly, and
 *   clearing it removes the summary.
 * - **Past about 240 characters** a count appears under it; nothing is
 *   refused (Miky, 15 Oct, call 1 A).
 * - **A save the relay refuses**: the page keeps the summary the relay holds,
 *   and your text stays where you wrote it with the reason under it, until you
 *   change it or save it (why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-refused-action-is-undone-and-your-text-comes-back.md).
 *
 * Plain text on one line (SPEC §6.12): pasted line breaks are saved as spaces.
 * Only for someone who can write, once the editors have loaded; before that,
 * and for everyone else, `ReadingSummary` draws the same text in the same place.
 */
export function LiveSummary({
  value,
  onCommit,
  onEnter,
  ref,
}: {
  /** The summary the relay holds; empty when there is none. */
  value: string
  /** Save it: `true`, or the words for why the relay refused. Empty text clears it. */
  onCommit: (value: string) => Promise<true | string>
  /** Enter, after the save has started: the caret goes into the description. */
  onEnter?: () => void
  ref?: Ref<InlineTextHandle>
}) {
  // The text being written, for the count; null when you are not in it.
  const [typing, setTyping] = useState<string | null>(null)
  const [refused, setRefused] = useState<string>()
  // The text the reason is about: the reason stays until that text changes.
  const attempted = useRef<string | null>(null)

  const commit = async (next: string) => {
    const text = summaryText(next)
    attempted.current = text
    const result = text === value ? true : await onCommit(text)
    if (result === true) {
      setRefused(undefined)
      return true
    }
    // Never a refusal with nothing said: it always shows a reason.
    setRefused(result || 'The relay gave no reason.')
    return false
  }

  return (
    <div className="flex flex-col gap-1">
      <InlineText
        ref={ref}
        variant="summary"
        clearable
        label="Summary"
        placeholder="Add a summary"
        value={value}
        onCommit={commit}
        onEnter={onEnter}
        onText={(text) => {
          // Changing the refused text is a new attempt: the old reason goes.
          if (text !== null && summaryText(text) !== attempted.current) setRefused(undefined)
          setTyping(text)
        }}
      />
      {typing !== null && <SummaryCount text={typing} />}
      {refused && <FieldLine tone="error">Summary not saved. {refused} Your text is still here.</FieldLine>}
    </div>
  )
}
