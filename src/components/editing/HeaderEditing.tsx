import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { InlineText, type InlineTextHandle } from '@estiva-app/ui/editor'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { LiveDescription } from './LiveDescription'
import { LiveSummary } from './LiveSummary'
import { ReadingSummary } from './ReadingSummary'
import type { LiveHeaderProps } from './LiveHeader'

/**
 * The title, the summary and the description as editors — `LiveHeader`'s
 * writing half, in its own chunk so a reader never loads it. Each is edited
 * where it stands, as in a document, and Enter goes on down the page: the
 * title to the summary, the summary to the start of the description (Linear's
 * behaviour, from the title to the description).
 */
export default function HeaderEditing({ title, titlePlaceholder, onRename, summary, onSummarize, description, format, onDescribe, nameOf, upload, resolved, onCommentOnBlock, onCopyBlockLink }: LiveHeaderProps & { resolved: Record<string, ForeignObjectData | null | undefined> }) {
  const [body, setBody] = useState<Editor | null>(null)
  const summaryEditor = useRef<InlineTextHandle>(null)
  const toDescription = () => {
    if (!body) return
    body.commands.focus('start')
    // An empty description gets its first line only as it takes the focus, so that first 'start' selects
    // the whole document, and the format toolbar opens over nothing. Again, it is a caret on that line.
    if (!body.state.selection.empty) body.commands.focus('start')
  }
  return (
    // 16px between title and description (Katerina, 29 September: "a bit more" than the 8px pages had), and the
    // summary 4px under the title, between them (the short-summary prototype's ShipFilePage).
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {/* The title: no box (Katerina, 29 September, findings E1 and E2), now the package's. */}
        <InlineText
          variant="title"
          label="Title"
          value={title}
          placeholder={titlePlaceholder}
          onCommit={onRename}
          onEnter={onSummarize ? () => summaryEditor.current?.focus('start') : toDescription}
        />
        {onSummarize ? <LiveSummary ref={summaryEditor} value={summary ?? ''} onCommit={onSummarize} onEnter={toDescription} /> : <ReadingSummary value={summary ?? ''} />}
      </div>
      <LiveDescription value={description} format={format} onCommit={onDescribe} nameOf={nameOf} resolved={resolved} onEditor={setBody} upload={upload} onCommentOnBlock={onCommentOnBlock} onCopyBlockLink={onCopyBlockLink} />
    </div>
  )
}
