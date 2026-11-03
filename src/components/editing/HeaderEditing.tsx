import { useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { InlineText, type InlineTextHandle } from '@estiva-app/ui/editor'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { LiveDescription } from './LiveDescription'
import { LiveSummary } from './LiveSummary'
import { ReadingSummary } from './ReadingSummary'
import { ReadingTitle } from './ReadingTitle'
import type { LiveHeaderProps } from './LiveHeader'

/*
  `LiveHeader`'s editor halves, in their own chunk: the title and the summary
  above the fields, the description below them. Two parts, not one, so the
  fields between them are drawn once and the editors arriving never draws them
  again (ONE-6 follow-up). Each is edited where it stands, as in a document,
  and Enter goes on down the page: the title to the summary, the summary past
  the fields to the start of the description (Linear's behaviour, from the
  title to the description). A reader who cannot write gets the title and
  summary as text and the description in the same editor, only read, so its
  links draw as a writer's do (WBD-7).
*/

/** The title and the summary under it, 4px apart (the short-summary prototype's ShipFilePage). */
export function TitleEditing({ title, titlePlaceholder, onRename, summary, onSummarize, readOnly = false, body }: LiveHeaderProps & { body: Editor | null }) {
  const summaryEditor = useRef<InlineTextHandle>(null)
  const toDescription = () => {
    if (!body) return
    body.commands.focus('start')
    // 'start' can be a selection, and a selection opens the format toolbar: the whole document when the
    // description is empty (its first line is made only as it takes the focus), or the block it opens
    // with when that is a line or a file. The caret goes on its first line of text instead.
    if (body.state.selection.empty) return
    const caret = TextSelection.findFrom(body.state.doc.resolve(0), 1, true)
    if (caret) body.view.dispatch(body.state.tr.setSelection(caret))
  }
  if (readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <ReadingTitle title={title} placeholder={titlePlaceholder} />
        <ReadingSummary value={summary ?? ''} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {/* The title: no box (Katerina, 29 September, findings E1 and E2), now the package's; at a document's heading
          size, 26px, as Leaf draws a Ship file (Katerina, 1 November), and the page's h1 as Leaf's is. */}
      <h1 className="text-h1 text-text-primary">
        <InlineText
          variant="heading"
          label="Title"
          value={title}
          placeholder={titlePlaceholder}
          onCommit={onRename}
          onEnter={onSummarize ? () => summaryEditor.current?.focus('start') : toDescription}
        />
      </h1>
      {onSummarize ? <LiveSummary ref={summaryEditor} value={summary ?? ''} onCommit={onSummarize} onEnter={toDescription} /> : <ReadingSummary value={summary ?? ''} />}
    </div>
  )
}

/** The description: the shared document editor, only read for a reader who cannot write, and nothing when that reader has none. */
export function DescriptionEditing({ description, format, onDescribe, merges, textPending = false, onMention, descriptionBy, nameOf, upload, resolved, onCommentOnBlock, onCopyBlockLink, holdKey, readOnly = false, onEditor }: LiveHeaderProps & { resolved: Record<string, ForeignObjectData | null | undefined>; onEditor: (editor: Editor | null) => void }) {
  if (readOnly && description.trim() === '') return null
  return (
    <LiveDescription value={description} format={format} onCommit={onDescribe} merges={merges} onMention={onMention} changedBy={descriptionBy} nameOf={nameOf} resolved={resolved} onEditor={onEditor} upload={upload} onCommentOnBlock={onCommentOnBlock} onCopyBlockLink={onCopyBlockLink} holdKey={holdKey} readOnly={readOnly || textPending} />
  )
}
