import { FieldLine } from '@estiva-app/ui'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { SUMMARY_LIMIT, summaryLength } from '@/nostr/summary'

/** The count a summary past about 240 characters shows under its field: a warning, never a refusal. */
export function SummaryCount({ text }: { text: string }) {
  const length = summaryLength(text)
  if (length <= SUMMARY_LIMIT) return null
  return (
    <FieldLine tone="warning">
      {length} characters. A summary reads best in one or two sentences, under {SUMMARY_LIMIT}.
    </FieldLine>
  )
}

/**
 * The optional Summary field of the New issue and New project dialogs, under the title: one or two sentences, with a count past about 240.
 *
 * Drawn as the short-summary prototype's `SummaryField` (Miky, 15 Oct): the
 * helper says what it is for until the text runs past 240, then the count
 * takes its place and the box grows a line. Empty is fine — a file with no
 * summary is created without one.
 */
export function SummaryField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const long = summaryLength(value) > SUMMARY_LIMIT
  return (
    // @estiva-escape(no-field-outside-a-form): one field of the New issue and New project forms, drawn only inside their Form
    <Field label="Summary" helper={long ? undefined : 'One or two sentences. It shows under the title, in lists and on cards.'}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="What is it for, in a sentence?" className={long ? 'h-[80px]' : 'h-[60px]'} />
      <SummaryCount text={value} />
    </Field>
  )
}
