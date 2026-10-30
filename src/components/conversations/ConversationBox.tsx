import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { Extension } from '@tiptap/core'
import type { JSONContent } from '@tiptap/react'
import { boxReadOf, composerDocument, composerDraft, composerText, embedsToSend, namedBefore, withoutNewUrgency, type ComposerLabels } from '@estiva-app/conversation'
import { referenceOfLink, type EditorDocument, type Imeta } from '@estiva-app/protocol'
import { Kbd } from '@estiva-app/ui'
import { CommentBox, commentBoxRows, LinkChips, type BoxFile, type BoxSentUnder, type BoxUnder, type ReferenceViewProps, type SendAnswer, type UploadAnswer } from '@estiva-app/ui/editor'
import type { ForeignObject } from '@/api/foreign'
import { askLinkValues, knownBlockOf, knownLinkValue, linksChanged } from '@/api/linkCards'
import { subscribeReferences, type ReferenceSection } from '@/api/references'
import { uploadAttachment } from '@/api/blobs'
import { useForeignObjects } from '@/api/useForeignObjects'
import { heldText, releaseHeld, useHeldTyping } from '@/auth/heldTyping'
import { browserDrafts, type DraftStore } from '@/lib/drafts'
import { useMentionPeople } from '@/components/editing/mentionables'
import { MessageCard, MessageChip, MessagePart } from '@/components/ui/MessageLinks'
import { PartCard } from '@/components/ui/PartCard'
import { referenceOfValue, sameFiles, type Answer, type Picks } from './shared'

/**
 * Ship's comment box: estiva-ui's `CommentBox`, the one box every app writes a
 * comment, a reply, a chat line and an edit in (COMM-7). What Ship adds is only
 * what Ship knows: its people for `@` and `!@`, its `[` sections, its `/`
 * Insert rows, its upload, its drafts, its lookups for the kit's chips, and a send through its own
 * `buildConversationMessage` that answers whether the relay took it.
 *
 * - **Not optimistic**: the box holds the words, shut, until the relay answers;
 *   a refusal is said under it with the words still in it — no toast (record
 *   a-refused-action-is-undone-and-your-text-comes-back).
 * - **In the box**, under the text with its files, while a message is written:
 *   the one file it names as the card it will be sent with, ✕ to take it off,
 *   and the live part of a pasted block link (COMM-8), read as Peek and Leaf
 *   read their boxes. An edit shows the card of a file it names first, and its
 *   ✕ leaves it off the save (Katerina, 30 Oct).
 * - **An edit opens with chips**, not `nostr:` text (SHI-49): people by name,
 *   a message or file `[` knows by its caption, any other by the kit's chip.
 * - **Closed** (an archived file, signed out): a line saying why takes the
 *   box's place (Decided 2026-10-17).
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/every-app-writes-and-reacts-with-one-shared-box.md
 */

export type BoxKind = 'conversation' | 'reply' | 'edit'

/** The box's accessible name: what it is for. */
const LABEL: Record<BoxKind, string> = { conversation: 'Start a conversation…', reply: 'Reply…', edit: 'Edit message' }

// Ship's `/` Insert rows (Miky, 16 October), after the shared Format section. An edit drops File and Urgent itself.
const INSERT = [commentBoxRows.file, commentBoxRows.mention, commentBoxRows.urgent, commentBoxRows.reference]

/** How many of a box's links are asked about — `LinkChips`' default `limit`, and the send's. */
const MAX_LINKS_ASKED = 24

const DEFAULT_DRAFTS = browserDrafts()

/** A file's card in the box, under the text, drawn as a sent message draws it. */
function BoxCard({ uri }: { uri: string }) {
  const [object] = useForeignObjects([uri]) ?? []
  return <MessageCard uri={uri} object={object} />
}

/**
 * What shows in the box while a message is written, read as it will be sent (why:
 * https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md). In an edit,
 * `before` is the message as it stands: only a file the edit names first gets a card, as the save reads it (`editMessage`).
 */
function boxUnder(here: string | undefined, nameOf?: (pubkey: string) => string, before?: string): BoxUnder {
  const context = { resolveLink: knownLinkValue, blockOf: knownBlockOf, here }
  return {
    read: (body) => {
      // Read again each time, so a link of the message's answered since counts as named before.
      const previous = before === undefined ? undefined : namedBefore(before, context)
      const links = boxReadOf(body as EditorDocument, previous ? { ...context, previous } : context)
      // Each read asks about the links not answered yet; an answer coming back reads again (`linksChanged`).
      void askLinkValues(links.urls.slice(0, MAX_LINKS_ASKED)).catch(() => {})
      const uri = links.card ? referenceOfValue(links.card) : undefined
      return {
        card: links.card && uri ? { value: links.card, view: <BoxCard uri={uri} /> } : undefined,
        parts: links.parts.map((part) => ({
          key: `${part.address}#${part.block}`,
          view: (
            <MessagePart>
              <PartCard address={part.address} block={part.block} nameOf={nameOf} />
            </MessagePart>
          ),
        })),
        names: [...links.values, ...links.parts.map((part) => part.address)],
      }
    },
    changed: linksChanged,
  }
}

export interface ConversationBoxProps {
  kind: BoxKind
  /** The trimmed marker text, the files already on the relay, and the picks; answers `true`, or why not. */
  onSend: (text: string, files: readonly Imeta[], picks: Picks) => Promise<Answer>
  /** What `[` offers for what was typed. Omitted, `[` opens nothing. */
  references?: (query: string) => readonly ReferenceSection[]
  /** The caption `[` gave a message or file reference, so an edit or a draft opens it as that chip. */
  captions?: ComposerLabels['referenceCaption']
  nameOf?: (pubkey: string) => string
  /** The page's resolved references, for the chips an edit opens with. */
  resolved?: Record<string, ForeignObject | null | undefined>
  /** The file this conversation is on: it gets no card here, and its blocks no part. */
  here?: string
  draftKey?: string
  drafts?: DraftStore
  upload?: (file: File) => Promise<Imeta>
  /** Why nothing can be written here: the line in the box's place. */
  closed?: string
  autoFocus?: boolean
  /** Editing a sent message: its text, urgent tags and files, where its unsaved words are held through a sign-in ending (AUT-4), and how to stop. */
  editing?: { body: string; urgent?: readonly string[]; files?: readonly Imeta[]; holdKey?: string; onCancel: () => void }
  className?: string
}

export function ConversationBox({ kind, onSend, references, captions, nameOf, resolved, here, draftKey, drafts = DEFAULT_DRAFTS, upload = uploadAttachment, closed, autoFocus, editing, className }: ConversationBoxProps) {
  const people = useMentionPeople()
  // The latest people and captions, for the labels a draft or an edit opens with: the directory may land after the box.
  const latest = useRef({ people, nameOf, captions })
  latest.current = { people, nameOf, captions }
  const labels = useMemo<ComposerLabels>(
    () => ({
      personLabel: (pubkey) => latest.current.people.find((p) => p.pubkey === pubkey)?.name ?? latest.current.nameOf?.(pubkey),
      referenceCaption: (uri) => latest.current.captions?.(uri),
    }),
    [],
  )
  const draft = useMemo(() => (draftKey && !editing ? composerDraft(drafts, draftKey, labels) : undefined), [draftKey, drafts, editing, labels])
  // An edit shows a card too, for a file it names first (Katerina, 30 Oct, as Peek's and Leaf's edit boxes do).
  const before = editing?.body
  const under = useMemo(() => boxUnder(here, nameOf, before), [before, here, nameOf])

  // An edit opens with the words held through a sign-in ending, else the message's; a re-read while editing does not reset them.
  const holdKey = editing?.holdKey
  const [opened] = useState(() => {
    if (!editing) return undefined
    const held = holdKey ? heldText(holdKey) : undefined
    return composerDocument(held ?? editing.body, labels, editing.urgent) as JSONContent
  })
  // What the edit says now, for an ending to hold (AUT-4): only once it differs from the message.
  const typed = useRef<string | undefined>(undefined)
  useHeldTyping(holdKey, () => (editing && typed.current !== undefined && typed.current !== editing.body.trim() ? typed.current : undefined))
  const [extensions] = useState(() => [
    // Every app link reads as its chip, pasted, typed or inside a passage, and is sent as the URL it was (OPT-19).
    LinkChips.configure({ referenceOf: (url) => referenceOfLink(url, knownLinkValue), ask: askLinkValues }),
    ...(holdKey
      ? [
          Extension.create({
            name: 'keepTypedEdit',
            onUpdate() {
              typed.current = composerText(this.editor.getJSON() as EditorDocument).text
            },
          }),
        ]
      : []),
  ])

  const uploadOne = async (file: File): Promise<UploadAnswer> => {
    try {
      return { accepted: true, value: await upload(file) }
    } catch (error) {
      return { accepted: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  const send = async (body: JSONContent, files: readonly BoxFile[] = [], shown: BoxSentUnder = {}): Promise<SendAnswer> => {
    const { text, urgent } = composerText(body as EditorDocument)
    const attached = files.flatMap((f) => (f.value ? [f.value as Imeta] : []))
    // An edit makes nobody urgent (CON-24), and keeps the message's cards by its own rule (`cardEditOf`).
    // An edit with no words is refused here (Delete removes a message), and an unchanged one closes with nothing published.
    if (editing && !text) return { accepted: false, reason: 'a message needs words; Delete removes it' }
    // A file can be added or taken off while editing (Miky, 26 Oct, PEEKM-4): the whole set rides the edit as `imeta`,
    // and an edit with none takes every file off (SPEC §6.8).
    // The card the edit box read, gone from what it saved: its ✕ took it off, and the save leaves it off.
    const read = editing ? under.read(body).card?.value : undefined
    const dropped = read && read !== shown.card ? read : undefined
    const unchanged = editing && text === editing.body.trim() && sameFiles(attached, editing.files ?? []) && !dropped
    const answer = unchanged
      ? true
      : editing
        ? await onSend(withoutNewUrgency(text, editing.body), attached, dropped ? { dropped } : {})
        : await onSend(text, attached, { urgent, embeds: embedsToSend({ card: shown.card }, new Set()) })
    // The box writes the sentence round the reason ("Not sent: … . Your text is back in the box."), so the reason's own full stop goes.
    if (answer !== true) return { accepted: false, reason: answer.replace(/\.+$/, '') }
    if (editing) {
      if (holdKey) releaseHeld(holdKey)
      editing.onCancel()
    }
    return { accepted: true }
  }

  const chipContext = useMemo(() => ({ resolved, nameOf }), [resolved, nameOf])
  // The message's own files show in the edit box, and can be taken off; more can be added, since the save writes them.
  const [editFiles] = useState<BoxFile[] | undefined>(() =>
    // Named as a sent message names it (`Attachment`).
    editing?.files?.map((file, i) => ({ id: `kept-${i}`, name: file.filename ?? file.alt ?? 'file', size: file.size, contentType: file.m, state: 'ready', value: file })),
  )
  const edit = editing && opened
    ? {
        body: opened,
        files: editFiles,
        writesFiles: true,
        onCancel: () => {
          if (holdKey) releaseHeld(holdKey)
          editing.onCancel()
        },
        onSave: (body: JSONContent, files: BoxFile[], shown: BoxSentUnder) => send(body, files, shown),
      }
    : undefined

  return (
    <BoxReferences.Provider value={chipContext}>
      <CommentBox
        label={LABEL[kind]}
        placeholder={<Placeholder kind={kind} />}
        people={people}
        references={references}
        referencesChanged={subscribeReferences}
        referenceView={BoxReference}
        insert={INSERT}
        draft={draft}
        edit={edit}
        extensions={extensions}
        upload={uploadOne}
        send={send}
        under={under}
        closed={closed ? { reason: closed } : undefined}
        autoFocus={autoFocus}
        className={className}
      />
    </BoxReferences.Provider>
  )
}

/** What the empty box says. */
function Placeholder({ kind }: { kind: BoxKind }) {
  if (kind === 'conversation') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <span>Start a conversation or type</span>
        <Kbd>/</Kbd>
        <span>for commands</span>
      </span>
    )
  }
  return <span>{kind === 'reply' ? 'Reply…' : 'Edit message'}</span>
}

/** What a `nostr:` reference in the box draws by: the page's resolved objects, and the directory's names. */
interface BoxReferenceContext {
  resolved?: Record<string, ForeignObject | null | undefined>
  nameOf?: (pubkey: string) => string
}

const BoxReferences = createContext<BoxReferenceContext>({})

/**
 * A `nostr:` reference or an app link the box holds, as the kit's chip — the
 * one a sent message draws: its key, its title cut short, its status as its
 * mark, its kind's icon (Katerina, 30 Oct) — resolved from the page, or asked
 * for when the page has not (an edit's reference to a message elsewhere:
 * SHI-49). While written it follows no click and shows no hover card. A person
 * is the directory's chip.
 */
function BoxReference({ uri, href }: ReferenceViewProps) {
  const { resolved, nameOf } = useContext(BoxReferences)
  const known = resolved?.[uri]
  const [asked] = useForeignObjects(known === undefined ? [uri] : []) ?? []
  const object = known ?? asked
  // A URL chip whose file has not come back, or cannot be read, reads as the URL it was written as (WBM-11).
  if (href && (!object || object.unreachable)) return <span>{href}</span>
  return <MessageChip uri={uri} object={object} nameOf={nameOf} preview={false} follows={false} opensAt={href} />
}

/** Loaded on first use (see ThreadList): the editor is its own chunk. */
export default ConversationBox
