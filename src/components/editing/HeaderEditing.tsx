import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { LiveDescription } from './LiveDescription'
import { LiveTitle } from './LiveTitle'
import { TitleRow, type LiveHeaderProps } from './LiveHeader'

/**
 * The title and the description as editors — `LiveHeader`'s writing half, in
 * its own chunk so a reader never loads it. Enter in the title puts the caret
 * at the start of the description (Linear's behaviour).
 */
export default function HeaderEditing({ title, titlePlaceholder, onRename, description, format, onDescribe, nameOf, archived, upload, resolved }: LiveHeaderProps & { resolved: Record<string, ForeignObjectData | null | undefined> }) {
  const [body, setBody] = useState<Editor | null>(null)
  return (
    // 16px between title and description (Katerina, 29 September: "a bit more" than the 8px pages had).
    <div className="flex flex-col gap-4">
      <TitleRow archived={archived}>
        <LiveTitle value={title} placeholder={titlePlaceholder} onCommit={onRename} onEnter={() => body?.commands.focus('start')} className="text-h2" />
      </TitleRow>
      <LiveDescription value={description} format={format} onCommit={onDescribe} nameOf={nameOf} resolved={resolved} onEditor={setBody} upload={upload} />
    </div>
  )
}
