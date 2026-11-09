import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Imeta, Quote } from '@estiva-app/protocol'
import { ownFileOf, refusalReason, withoutOwnFileLines } from '@estiva-app/conversation'
import { ConversationCard, FieldLine, QuotedLine, ReplyCard, type ReactionRowProps, type RepliesRowProps } from '@estiva-app/ui'
import { ago } from '@/lib/time'
import type { DraftStore } from '@/lib/drafts'
import { REACTION_EMOJI, type Reaction, type Resolution } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import type { referenceCaptions, referenceSections } from '@/api/references'
import { Attachments as FileAttachments } from '@/components/ui/Attachment'
import { BlockAnchorNote } from '@/components/ui/BlockAnchorNote'
import { PartCard } from '@/components/ui/PartCard'
import type { MessageData } from '@/components/ConversationThread'
import { useReopenHeld } from '@/auth/heldTyping'
import { MessageText } from './MessageText'
import { Box } from './lazyBox'
import type { Answer } from './shared'

/** What the relay said about a reaction, as the kit's row takes it back (its `ReactionAnswer`, not exported by name). */
type ReactionAnswer = Exclude<Awaited<ReturnType<NonNullable<ReactionRowProps['onToggle']>>>, void>

/** The five reactions, each named, as the package's row and picker take them (SPEC §6.6). */
const REACTION_OPTIONS = REACTION_EMOJI.map(({ emoji, name }) => ({ emoji, label: name }))

/** Ship's words on the kit's cards: a message, edited and deleted as one (her rule for the one conversation, 2 November). */
const SHIP_WORDS = { noun: 'message', editLabel: 'Edit message', deleteLabel: 'Delete message', moreLabel: 'Message actions' } as const

/** What a deletion is in Ship, said under the kit's question: a request the relay decides, and what stays. */
function deleteNote(replies: number): ReactNode {
  return (
    <>
      <p>
        This publishes a NIP-09 deletion request. The relay decides: it accepts one from the message&rsquo;s author, or from the
        owner of an agent that wrote it. Copies held by other relays or apps are unaffected.
      </p>
      {replies > 0 && (
        <p>
          Its {replies} {replies === 1 ? 'reply is a separate event and is' : 'replies are separate events and are'} not deleted:{' '}
          {replies === 1 ? 'it stays' : 'they stay'}, under &ldquo;This comment was deleted.&rdquo;
        </p>
      )}
    </>
  )
}

/** A quote in one line, as the kit's `quoteText` says it, which lives in the editor's entry a reader never downloads. */
const quoteWords = (quote: Quote) => (quote.end ? `${quote.start} … ${quote.end}` : quote.start)

/**
 * What a comment is about, under its name: the anchored block, live, with the same card as a part (Decided
 * 2026-10-07), or the note when that block can no longer be shown; a comment written on a selection in Leaf, the
 * words it quotes. Nothing for a comment on the whole file.
 */
function aboutOf(message: MessageData, nameOf?: (pubkey: string) => string): ReactNode {
  if (message.anchorPart) return <PartCard address={message.anchorPart.address} block={message.anchorPart.block} nameOf={nameOf} />
  if (message.anchor && message.anchor.state !== 'unanchored') return <BlockAnchorNote anchor={message.anchor} />
  if (message.quote) return <QuotedLine words={quoteWords(message.quote)} />
  return undefined
}

/** What a comment and a reply share: how Ship draws, reacts to, edits and deletes one message. */
export interface ShipMessageProps {
  message: MessageData
  /** The objects its references name, read once for the page (`useThreadReferences`). */
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** The address of the file the page is on: no card for it here, its chip stays (WID-3). */
  here?: string
  /** The address of the file the conversation itself is on, which its edit box gives no card. */
  boxHere?: string
  nameOf?: (pubkey: string) => string
  viewer?: string
  reactions?: readonly Reaction[]
  onToggleReaction?: (emoji: string, mine?: string) => Promise<Answer>
  onDelete?: () => Promise<boolean | void> | boolean | void
  /** Publish an edit; with `removeCard`, ✕ on that file's sent card, the text left as it is. */
  onEdit?: (body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string) => Promise<Answer>
  /** What `[` offers in its edit box, and the captions its references open with. */
  references?: (query: string) => ReturnType<typeof referenceSections>
  captions?: ReturnType<typeof referenceCaptions>
  drafts?: DraftStore
  /** Nothing can be written here (an archived file, signed out): no React, Edit or Delete, its cards' values as words. */
  closed?: boolean
  /** Not read yet: the dot and the card's edge; urgent for the viewer, the amber mark. */
  isNew?: boolean
}

/**
 * One message's writes, as Ship's hand-made card held them: one reaction write at a time until the read after it
 * lands, the ✕ on a sent card, an edit that opens again after the passkey tap (AUT-4), and each refusal in words.
 */
function useMessageWrites({ message, reactions, onToggleReaction, onEdit, nameOf, viewer }: ShipMessageProps) {
  const [editing, setEditing] = useState(false)
  // An edit open when the sign-in ended opens again after the passkey tap, with what was typed (AUT-4).
  const editHold = `edit:${message.id}`
  useReopenHeld(onEdit && editHold, () => setEditing(true))
  // One ✕ at a time: the next one reads the set this one leaves, once the page has read it back.
  const [removing, setRemoving] = useState(false)
  const [cardRefused, setCardRefused] = useState<string | null>(null)
  const removeCard =
    onEdit && !removing
      ? (value: string) => {
          setRemoving(true)
          setCardRefused(null)
          // ✕ on a sent card is an edit: its refusal is an edit's, in the shared words (ONE-4).
          void onEdit(message.body, value)
            .then((answer) => setCardRefused(answer === true ? null : `Not saved: ${refusalReason(answer)}.`))
            .finally(() => setRemoving(false))
        }
      : undefined
  // One reaction write at a time, until the read after it lands: a second click before then would write from the row as it was.
  const pending = useRef(false)
  useEffect(() => {
    pending.current = false
  }, [reactions])
  // The relay's answer goes back to the card, which says a refusal under the reactions, "Not reacted: <reason>.", in the
  // shared words (ONE-4). A click while one is pending answers nothing, so the last refusal stays said.
  const react =
    onToggleReaction &&
    (async (emoji: string): Promise<ReactionAnswer | undefined> => {
      if (pending.current) return undefined
      pending.current = true
      const answer = await onToggleReaction(emoji, reactions?.find((r) => r.emoji === emoji)?.mine)
      if (answer === true) return { accepted: true }
      pending.current = false
      return { accepted: false, reason: answer }
    })
  const named = (pubkey: string) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`
  const reactionRow: ReactionRowProps = { reactions: reactions ?? [], options: REACTION_OPTIONS, nameOf: named, viewer, onToggle: react || undefined }
  return { editing, setEditing, editHold, removeCard, cardRefused, reactionRow }
}

/** The props both kit cards take from one Ship message: who, when, the words, files, reactions, the menu in Ship's words. */
function cardProps(props: ShipMessageProps, writes: ReturnType<typeof useMessageWrites>) {
  const { message, resolved, here, boxHere, nameOf, viewer, onDelete, onEdit, references, captions, drafts, closed = false, isNew = false } = props
  const { editing, setEditing, editHold, removeCard, cardRefused, reactionRow } = writes
  // The file the comment is on: a line that is only a link to it draws nothing, and an edit opens without it (ONE-11).
  const ownFile = message.event ? ownFileOf(message.event) : []
  return {
    ...SHIP_WORDS,
    author: { name: message.author.name ?? '—', picture: message.author.picture, bot: message.author.bot },
    time: ago(message.at),
    at: message.at * 1000,
    edited: message.editedAt !== undefined ? `Edited ${ago(message.editedAt)}` : undefined,
    reactions: reactionRow,
    isNew,
    // An urgent message for you, not read yet: the amber mark (CON-24).
    urgent: isNew && !!viewer && !!message.urgent?.includes(viewer),
    // Edit and Delete are offered only where Ship offers them (SHI-29: your own, or your agent's).
    own: !!(onEdit || onDelete),
    readOnly: closed,
    editing,
    onEditingChange: setEditing,
    editor: onEdit
      ? (done: () => void) => (
          <Box
            kind="edit"
            editing={{ body: withoutOwnFileLines(message.body, ownFile), urgent: message.urgent, files: message.files, embeds: message.embeds, holdKey: editHold, onCancel: done }}
            references={references}
            captions={captions}
            resolved={resolved}
            nameOf={nameOf}
            here={boxHere}
            drafts={drafts}
            // Every file the box still holds, changed or not: an edit is the whole new message. And the card its ✕ took off.
            onSend={(body, files, picks) => onEdit(body, undefined, files, picks.dropped)}
          />
        )
      : undefined,
    onDelete,
    children: (
      <>
        <MessageText
          body={message.body}
          embeds={message.embeds}
          parts={message.parts}
          urgent={message.urgent}
          resolved={resolved}
          nameOf={nameOf}
          here={here}
          ownFile={ownFile}
          // Files stay between the words and the cards, where Ship draws them (SHI-2).
          between={<FileAttachments files={message.files} />}
          onRemoveCard={removeCard}
          words={closed}
        />
        {cardRefused && <FieldLine tone="error">{cardRefused}</FieldLine>}
      </>
    ),
  }
}

export interface ShipCommentProps extends ShipMessageProps {
  /** Its comment was deleted (PER-24): "This comment was deleted.", its replies under it, and no new reply. */
  deleted?: boolean
  /** Its comment was not read and nothing says it was deleted (SPEC §6.5, ONE-9): "This comment can't be shown.", drawn as a deleted one is. */
  unseen?: boolean
  /** Its thread's row: how many replied, their faces, the last time, how many are new. */
  replies?: Omit<RepliesRowProps, 'urgent'>
  /** How many replies a deletion leaves behind, said in the question. */
  repliesLeftBehind?: number
  /** Reply, on the strip: opens its thread at the box. */
  onReply?: () => void
  /** A press on the comment: its thread opens or closes. */
  onClick?: () => void
  /** Its thread stands resolved, by whichever app: who, the note and when. */
  resolution?: Resolution
  /**
   * Resolve with the dialog's note, or reopen (ONE-8): an open thread offers Resolve, a resolved one Reopen. Absent,
   * neither is offered. A resolve's refusal is said in the dialog, which stays open; a reopen's by the page.
   */
  onResolve?: (resolve: boolean, note?: string) => Promise<Answer>
}

/** A thread's comment on the kit's `ConversationCard`, in Ship's words. */
export function ShipComment(props: ShipCommentProps) {
  const writes = useMessageWrites(props)
  const { message, nameOf, deleted = false, unseen = false, replies, repliesLeftBehind = 0, onReply, onClick, resolution, onResolve } = props
  const named = (pubkey: string) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`
  const [resolveRefused, setResolveRefused] = useState<string>()
  const resolve =
    onResolve && !resolution
      ? async (note: string) => {
          setResolveRefused(undefined)
          const answer = await onResolve(true, note)
          if (answer !== true) setResolveRefused(`Not resolved: ${refusalReason(answer)}.`)
          return answer === true
        }
      : undefined
  // One reopen at a time, until the read after it lands, as a reaction is: a second click would sign a second 9101.
  const reopening = useRef(false)
  useEffect(() => {
    reopening.current = false
  }, [resolution])
  const reopen =
    onResolve && resolution
      ? () => {
          if (reopening.current) return
          reopening.current = true
          void onResolve(false).then((answer) => {
            if (answer !== true) reopening.current = false
          })
        }
      : undefined
  return (
    <ConversationCard
      {...cardProps(props, writes)}
      about={aboutOf(message, nameOf)}
      deleted={deleted}
      unseen={unseen}
      deleteNote={deleteNote(repliesLeftBehind)}
      replies={replies}
      onReply={onReply}
      onClick={onClick}
      resolved={resolution ? { by: named(resolution.by), note: resolution.message, at: ago(resolution.at) } : undefined}
      onResolve={resolve}
      resolveRefused={resolveRefused}
      onReopen={reopen}
    />
  )
}

/** A reply on the kit's `ReplyCard`, in Ship's words. */
export function ShipReply(props: ShipMessageProps) {
  const writes = useMessageWrites(props)
  return <ReplyCard {...cardProps(props, writes)} id={props.message.id} deleteNote={deleteNote(0)} />
}
