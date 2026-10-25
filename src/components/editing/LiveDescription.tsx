import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  BLOCK_DOCUMENT_FORMAT,
  descriptionTextToBlockDocument,
  documentForEditing,
  encodeNpub,
  publishableFromEditor,
  referenceOfLink,
  toEditorDocument,
  type ContentFormat,
  type EditorDocument,
  type Imeta,
} from '@estiva-app/protocol'
import { newlyNamedPeople, peopleNamedInText, type FileText } from '@estiva-app/conversation'
import { DocumentEditor, type DocumentCodec, type HeldTyping, type MentionPerson } from '@estiva-app/ui/editor'
import { uploadAttachment } from '@/api/blobs'
import { REFERENCE_COPY, fileSections, subscribeReferences } from '@/api/references'
import { sessionEnded } from '@/auth/estivaId'
import { heldText, registerHeld, releaseHeld } from '@/auth/heldTyping'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { askLinkValues, knownLinkValue } from '@/api/linkCards'
import { blockRows } from './blockRows'
import { DescriptionFile, DescriptionLink, DescriptionLinks, MAX_LINKS_PER_DESCRIPTION } from './descriptionLinks'
import { useMentionPeople } from './mentionables'

/**
 * A description's text as the shared editor reads and writes it. A link on
 * words keeps its link through a save (§13.3, C23): every editor of a
 * document's text is now the shared one (Peek edits none), the condition WBD-1
 * set for turning it on.
 */
const CODEC: DocumentCodec = {
  read: (value, format) => toEditorDocument(documentForEditing(value, format as ContentFormat), { links: true }),
  write: (doc) => publishableFromEditor(doc as EditorDocument),
}

/** Where text typed as the sign-in ends is held until the passkey tap (AUT-4). */
const HOLD: HeldTyping = { text: heldText, release: releaseHeld, register: registerHeld, ended: () => sessionEnded() !== null }

/** `[`: files only, this Folder's first — an issue's project's issues — as a Leaf page offers its Folder's. */
const REFERENCES = { sections: fileSections, subscribe: subscribeReferences, ariaLabel: REFERENCE_COPY.files, sectionLabel: REFERENCE_COPY.files }

/** An app URL reads as the chip of what it names, and saves as the URL (Widgets, Miky 14 Oct). */
const LINK_CHIPS = { referenceOf: (url: string) => referenceOfLink(url, knownLinkValue), ask: askLinkValues, limit: MAX_LINKS_PER_DESCRIPTION }

/** Markdown pasted as plain text lands as the blocks it spells, tables and links on words included, read as the agent reads a description (LEAF-10). */
const readMarkdown = (text: string) => toEditorDocument(descriptionTextToBlockDocument(text), { links: true })

const uriOf = (person: MentionPerson) => (person.pubkey ? `nostr:${encodeNpub(person.pubkey)}` : null)

/**
 * An issue's or a project's description: the shared document editor every app
 * writes a document with (`DocumentEditor`), so it does what a Leaf page does —
 * `[` and `/` → Link to a file, `@` a person, a pasted app link its chip, alone
 * on its line its row, and *Show as Card* its card in the row's place, drawn
 * with the kit's chip, row and card as a message draws them. Comments on a
 * selection are off: where Ship shows them is the next stage (Miky, 19 Oct).
 * It saves when you leave it; someone else's save arrives as the editor says.
 *
 * A save that names someone the text it was edited from did not adds them to
 * the file (`onMention`), as the Add button does; the save itself carries no
 * `p`, and a typo fix adds nobody.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/every-app-edits-a-document-with-one-shared-editor.md
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-mention-in-a-files-text-adds-the-person-with-no-unread.md
 */
export function LiveDescription({
  value,
  format,
  onCommit,
  onMention,
  nameOf,
  resolved = {},
  onEditor,
  upload = uploadAttachment,
  onCommentOnBlock,
  onCopyBlockLink,
  holdKey,
  changedBy = null,
  readOnly = false,
}: {
  value: string
  /** Where its unsaved text is held when the sign-in ends while it is open (AUT-4): the issue's or project's address. */
  holdKey?: string
  format: ContentFormat
  /** `left()` is true once the description has gone from the page: a refusal then has no line under the field to say it. */
  onCommit: (value: string, contentFormat?: string, left?: () => boolean) => Promise<boolean> | boolean
  /** Add the people a save names anew; answers the ones that could not be added, tried again at the next save that still names them. */
  onMention?: (people: readonly string[]) => Promise<readonly string[]>
  /** The name in "<name> saved a newer version": who saved `value` last, when it was not you. */
  changedBy?: string | null
  nameOf?: (pubkey: string) => string
  /** The description's references, resolved once by the page — RIC-10. */
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** Hands the editor up, so the title's Enter can move the caret here. */
  onEditor?: (editor: Editor | null) => void
  upload?: (file: File) => Promise<Imeta>
  /** The block menu's Comment: start a conversation anchored to that block. Without it the row is not offered. */
  onCommentOnBlock?: (blockId: string) => void
  /** The block menu's Copy link: the page's copy, which confirms it. */
  onCopyBlockLink?: (link: string) => void
  /** Only read: an archived file's, or a reader's who cannot write. */
  readOnly?: boolean
}) {
  // The description has gone from the page: a refusal now is the page's to say.
  const left = useRef(false)
  useEffect(() => {
    // Set again on mount: StrictMode mounts twice, and the first unmount must not count as leaving.
    left.current = false
    return () => {
      left.current = true
    }
  }, [])
  // Your last save, so the text the next one is edited from is read in the format it was written in.
  const lastSave = useRef<FileText | null>(null)
  // The people a save named whom the relay would not add: the next save that still names them tries again.
  const unadded = useRef<readonly string[]>([])
  const commit = useCallback(
    async (next: string, contentFormat: string | undefined, editedFrom: string) => {
      const from: FileText =
        lastSave.current && lastSave.current.content === editedFrom
          ? lastSave.current
          : { content: editedFrom, ...(format === 'blocks' ? { format: BLOCK_DOCUMENT_FORMAT } : {}) }
      const saved: FileText = { content: next, ...(contentFormat ? { format: contentFormat } : {}) }
      const ok = await onCommit(next, contentFormat, () => left.current)
      if (!ok) return false
      lastSave.current = saved
      if (onMention) {
        const named = peopleNamedInText(saved)
        const people = [...new Set([...newlyNamedPeople(saved, from), ...unadded.current.filter((person) => named.has(person))])]
        unadded.current = people.length ? await onMention(people) : []
      }
      return true
    },
    [onCommit, onMention, format],
  )
  const people = useMentionPeople()
  const mentions = { people: () => people, uriOf }
  return (
    // The page's own handle on the field (probes and the smoke test), as before the shared editor.
    <div data-description={readOnly ? 'reading' : 'editing'}>
      <DocumentEditor
        value={value}
        format={format}
        codec={CODEC}
        onCommit={commit}
        label="Description"
        placeholder="Add a description…"
        readOnly={readOnly}
        changedBy={changedBy ? { name: changedBy } : null}
        hold={HOLD}
        {...(holdKey ? { holdKey } : {})}
        references={REFERENCES}
        mentions={mentions}
        linkChips={LINK_CHIPS}
        // The attachment's attributes are the `imeta` fields exactly (§13.3).
        upload={async (file) => ({ ...(await upload(file)) })}
        readMarkdown={readMarkdown}
        blockRows={blockRows(onCommentOnBlock, onCopyBlockLink)}
        referenceView={DescriptionLink}
        attachmentView={DescriptionFile}
        wrap={(children, editor) => (
          <DescriptionLinks editor={editor} resolved={resolved} nameOf={nameOf} readOnly={readOnly}>
            {children}
          </DescriptionLinks>
        )}
        {...(onEditor ? { onEditor } : {})}
      />
    </div>
  )
}
