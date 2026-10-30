import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { IconDotsVertical, IconMessage2, IconX } from '@tabler/icons-react'
import type { Imeta } from '@estiva-app/protocol'
import { AddReactionButton, Avatar, Button, Card, EmptyState, FieldLine, IconButton, Menu, MenuItem, ReactionRow, SkeletonBar, SkeletonList, WithTooltip } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { draftKeys, type DraftStore } from '@/lib/drafts'
import { offersEditAndDelete } from '@estiva-app/conversation'
import { REACTION_EMOJI, REACTION_HORIZON, me, type Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { Attachments as FileAttachments } from '@/components/ui/Attachment'
import { BlockAnchorNote } from '@/components/ui/BlockAnchorNote'
import { MessagePart } from '@/components/ui/MessageLinks'
import { ConfirmDeleteMessage, NewSinceHere, useThreadReactions, useThreadReferences, type ConversationsProps, type MessageData, type ThreadData } from '@/components/ConversationThread'
import type { ActivityProps } from '@/components/Activity'
import { PLACE_ICON, RELATION, Time, type Answer, type MentionListViewProps, type Picks, type ThreadListViewProps } from './shared'
import { MessageText } from './MessageText'
import { messageScope, referenceCaptions, referenceSections } from '@/api/references'
import { PartCard } from '@/components/ui/PartCard'
import { useReopenHeld } from '@/auth/heldTyping'

/*
  The box is its own chunk: its editor is ProseMirror, which a reader must
  never download (RIC-14's rule for the description, kept). Until it lands a
  bar holds its place; a closed box is a line and needs no editor.
*/
const LazyBox = lazy(() => import('./ConversationBox'))
function Box(props: ComponentProps<typeof LazyBox>) {
  return (
    <Suspense fallback={props.kind === 'edit' ? null : <SkeletonBar shape="control" className={cn('h-10 w-full', props.className)} />}>
      <LazyBox {...props} />
    </Suspense>
  )
}

/** The five reactions, each named, as the package's row and picker take them (SPEC §6.6). */
const REACTION_OPTIONS = REACTION_EMOJI.map(({ emoji, name }) => ({ emoji, label: name }))

/**
 * The conversations on a project or an issue, and the ones elsewhere that
 * mention it (Katerina, 29–30 September).
 *
 * - **A card per conversation**, as production had it, with 20px faces and the
 *   name in medium weight. Nothing changes on hover.
 * - **"…" always there**, the package `IconButton`, for Edit and Delete.
 * - **Under every message and reply**: its reactions, then the add-reaction
 *   `IconButton` (Linear's order). Under a first message, a second row: the
 *   replies button — the package `Button`, "💬 2", or the icon alone as a
 *   square when there are none — lit while open. Opening it puts you in the
 *   reply box.
 * - **Replies** hang one step in behind a left rule, with the reply box last.
 *
 * **Everything production's `Conversations` and `Activity` do is kept, part for
 * part**: the same props (`ConversationsProps`, `ActivityProps`) and reads
 * (`useThreadReferences`, `useThreadReactions`); files (`Attachments`, the
 * signed fetch); linked files (the kit's chips, rows and cards, keeping their shape while they resolve);
 * the note on a comment about one block; mentions by name; "edited" with when;
 * the reactions and their horizon line; "New since you last read this", with a
 * thread holding an unread reply opening by itself; the delete question with the
 * replies it leaves behind; edits and deletes kept open on a refusal; controls
 * absent where nobody may write and disabled with the reason where it is
 * momentary; drafts per thread and per object; the relation line on "Mentioned
 * in" with its note about what this reader cannot see. Every box — start,
 * reply, edit — is estiva-ui's `CommentBox` (`ConversationBox`), and the
 * reactions are its `ReactionRow` (COMM-7). Where nothing can be written (an
 * archived file, signed out) each box is a line saying why, and React, Edit
 * and Delete are not offered (Decided 2026-10-17).
 */

interface MessageProps {
  message: MessageData
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** The address of the file the page is on: no card for it here, its chip stays (WID-3). */
  here?: string
  /** The address of the file the conversation itself is on, which its edit box gives no card: the page's, or a "Mentioned in" thread's own. */
  boxHere?: string
  nameOf?: (pubkey: string) => string
  viewer?: string
  reactions?: readonly Reaction[]
  onToggleReaction?: (emoji: string, mine?: string) => Promise<Answer>
  onDelete?: () => Promise<boolean | void> | boolean | void
  /**
   * Publish an edit; with `removeCard`, ✕ on that file's sent card, the text left as it is. `files` only when it
   * changed them — the whole set after it. `dropped`: the card the edit box's ✕ took off.
   */
  onEdit?: (body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string) => Promise<Answer>
  /** What `[` offers in its edit box, and the captions its references open with. */
  references?: (query: string) => ReturnType<typeof referenceSections>
  captions?: ReturnType<typeof referenceCaptions>
  repliesLeftBehind?: number
  drafts?: DraftStore
  /** A first message's second row: the replies button. */
  footer?: React.ReactNode
  /** Nothing can be written here (an archived file, signed out): its cards' values read as words. */
  closed?: boolean
}

function Message({ message, resolved, here, boxHere, nameOf, viewer, reactions, onToggleReaction, onDelete, onEdit, references, captions, repliesLeftBehind = 0, drafts, footer, closed = false }: MessageProps) {
  const [editing, setEditing] = useState(false)
  // An edit open when the sign-in ended opens again after the passkey tap, with what was typed (AUT-4).
  const editHold = `edit:${message.id}`
  useReopenHeld(onEdit && editHold, () => setEditing(true))
  const [confirming, setConfirming] = useState(false)
  // One ✕ at a time: the next one reads the set this one leaves, once the page has read it back.
  const [removing, setRemoving] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const removeCard =
    onEdit && !removing
      ? (value: string) => {
          setRemoving(true)
          setRefused(null)
          void onEdit(message.body, value)
            .then((answer) => setRefused(answer === true ? null : `Card not removed: ${answer}`))
            .finally(() => setRemoving(false))
        }
      : undefined
  // One reaction write at a time, until the read after it lands: a second click before then would write from the row as it was.
  const pending = useRef(false)
  useEffect(() => {
    pending.current = false
  }, [reactions])
  const react =
    onToggleReaction &&
    (async (emoji: string) => {
      if (pending.current) return
      pending.current = true
      setRefused(null)
      const answer = await onToggleReaction(emoji, reactions?.find((r) => r.emoji === emoji)?.mine)
      if (answer !== true) {
        pending.current = false
        setRefused(`Not reacted: ${answer}`)
      }
    })
  const named = (pubkey: string) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`

  return (
    <article className="flex flex-col gap-2" data-message={message.id}>
      {/* What a comment is about, above it: the anchored block, live, with the same card as a part (COM-2). */}
      {message.anchorPart ? (
        <MessagePart>
          <PartCard address={message.anchorPart.address} block={message.anchorPart.block} nameOf={nameOf} />
        </MessagePart>
      ) : (
        <BlockAnchorNote anchor={message.anchor} />
      )}
      <div className="flex min-h-6 items-center gap-2">
        <Avatar size={20} src={message.author.picture} name={message.author.name} />
        <span className={cn('truncate text-body-2-strong', message.author.name ? 'text-text-primary' : 'text-text-muted')}>{message.author.name ?? '—'}</span>
        <Time at={message.at} />
        {message.editedAt !== undefined && (
          <WithTooltip label={`Edited ${ago(message.editedAt)}`}>
            <span className="text-caption text-text-muted">(edited)</span>
          </WithTooltip>
        )}
        {/* "…", always there (her note 3). Absent where nobody may write, as production has it. */}
        {(onEdit || onDelete) && !editing && (
          <div className="ml-auto">
            <Menu
              align="right"
              trigger={
                <IconButton variant="muted" aria-label="Message actions" tooltip="Message actions">
                  <IconDotsVertical size={16} stroke={1.5} />
                </IconButton>
              }
            >
              {onEdit && <MenuItem label="Edit message" onClick={() => setEditing(true)} />}
              {onDelete && <MenuItem label="Delete message" destructive onClick={() => setConfirming(true)} />}
            </Menu>
          </div>
        )}
      </div>
      {editing && onEdit ? (
        <Box
          kind="edit"
          editing={{ body: message.body, urgent: message.urgent, files: message.files, holdKey: editHold, onCancel: () => setEditing(false) }}
          references={references}
          captions={captions}
          resolved={resolved}
          nameOf={nameOf}
          here={boxHere}
          drafts={drafts}
          // Every file the box still holds, changed or not: an edit is the whole new message. And the card its ✕ took off.
          onSend={(body, files, picks) => onEdit(body, undefined, files, picks.dropped)}
        />
      ) : (
        <>
          <MessageText
            body={message.body}
            embeds={message.embeds}
            parts={message.parts}
            urgent={message.urgent}
            resolved={resolved}
            nameOf={nameOf}
            here={here}
            between={<FileAttachments files={message.files} />}
            onRemoveCard={removeCard}
            words={closed}
          />
          {/* Row one: the package's pills, then its add button (her note 4, Linear's order); none yet, the add button alone. Where nobody may write, the pills only. */}
          {reactions?.length ? (
            <ReactionRow reactions={reactions} options={REACTION_OPTIONS} nameOf={named} viewer={viewer} onToggle={react ? (emoji) => void react(emoji) : undefined} />
          ) : (
            react && (
              <div className="flex">
                <AddReactionButton options={REACTION_OPTIONS} onPick={(emoji) => void react(emoji)} />
              </div>
            )
          )}
          {refused && <FieldLine tone="error">{refused}</FieldLine>}
          {/* Row two, a first message only: the replies button. */}
          {footer}
        </>
      )}
      {confirming && onDelete && <ConfirmDeleteMessage replies={repliesLeftBehind} onConfirm={onDelete} onClose={() => setConfirming(false)} />}
    </article>
  )
}

/**
 * The replies button: one part for both cases (Katerina, 30 September: "these two should be unified") — the
 * package's Button, small and outlined, with the reply icon: "Reply" when there are none yet, the number when
 * there are. The IconButton it replaces was taller and rounder than the Button beside it.
 */
function RepliesButton({ count, open, newCount, onToggle }: { count: number; open: boolean; newCount: number; onToggle: () => void }) {
  const label = count === 0 ? (open ? 'Close reply' : 'Reply') : `${count} ${count === 1 ? 'reply' : 'replies'}${newCount ? `, ${newCount} new` : ''}`
  return (
    <div className="flex">
      <WithTooltip label={count === 0 ? label : open ? 'Hide replies' : 'Show replies'}>
        {/* @estiva-escape(no-restyled-part): Button has no pressed state yet (IconButton has); a `pressed` Button is tracked in UIG-47 */}
        <Button
          variant="outlined"
          size="small"
          leadingIcon={<IconMessage2 size={14} stroke={1.5} />}
          aria-label={label}
          aria-expanded={open}
          // No replies yet: the icon alone, the same 24px button made square. Open: lit, as IconButton's pressed is.
          className={cn(count === 0 && 'w-6 px-0', open && 'bg-bg-active text-text-primary')}
          onClick={onToggle}
        >
          {count > 0 && count}
          {newCount > 0 && <span className="text-text-interactive">· {newCount} new</span>}
        </Button>
      </WithTooltip>
    </div>
  )
}

interface ThreadProps {
  thread: ThreadData
  /** Every thread on the page: what the reply box's `[` offers (CON-25). */
  pageThreads: readonly ThreadData[]
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** Why nothing can be written here: the reply box is a line saying it, and React, Edit and Delete are not offered. */
  disabledReason?: string
  /** This thread's message ids that were new when the page opened, oldest first: the divider and opening by itself. */
  unread?: readonly string[]
  /** This thread's message ids still unread now, for "N new" (SHI-38). */
  stillUnread?: readonly string[]
  /** False while read state is loading: a thread drawn then opens by itself once it knows (99557309). */
  judged?: boolean
  resolved?: Record<string, ForeignObjectData | null | undefined>
  here?: string
  /**
   * A thread living on another file ("Mentioned in"), and that file's address: its boxes treat that file as their own,
   * so they show no card for it, which a reply never sends (`reply` drops it).
   */
  elsewhere?: boolean
  file?: string
  nameOf?: (pubkey: string) => string
  reactionsBy?: Record<string, readonly Reaction[]>
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<Answer>
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  onEditMessage?: (messageId: string, body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string) => Promise<Answer>
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
  viewer?: string
  onShown?: (threadId: string, open: boolean) => void
}

/** Replies hang one step in, behind today's left rule. */
const REPLY_RULE = 'ml-2.5 border-l-2 border-border-default pl-3'

function Thread({ thread, pageThreads, onReply, disabledReason, unread, stillUnread, judged = true, resolved, here, elsewhere = false, file, nameOf, reactionsBy, onReact, onDeleteMessage, onEditMessage, upload, drafts, viewer, onShown }: ThreadProps) {
  const scope = useMemo(() => messageScope(pageThreads, thread.id), [pageThreads, thread.id])
  const references = useCallback((query: string) => referenceSections(scope, query, nameOf), [scope, nameOf])
  const captions = useMemo(() => referenceCaptions(scope, nameOf), [scope, nameOf])
  const unreadFrom = unread?.[0]
  // The replies that are new to you, not every reply after the first new one:
  // your own reply below it is never new, and an unread root leaves its
  // replies to their own verdict (SHI-38).
  const newIn = (ids: readonly string[] | undefined) => (ids ? thread.replies.filter((reply) => ids.includes(reply.id)).length : 0)
  const newCount = newIn(stillUnread)
  const [open, setOpen] = useState(newIn(unread) > 0)
  // Drawn before read state loaded: open once the verdict comes, and only then —
  // a reply arriving later lights "N new" and leaves the thread as it is.
  const [judgedYet, setJudgedYet] = useState(judged)
  if (judged && !judgedYet) {
    setJudgedYet(true)
    if (newIn(unread) > 0) setOpen(true)
  }
  useEffect(() => {
    if (!open || !onShown) return
    onShown(thread.id, true)
    return () => onShown(thread.id, false)
  }, [open, thread.id, onShown])
  const [focusReply, setFocusReply] = useState(false)
  const toggle = () => {
    setFocusReply(!open)
    setOpen(!open)
  }
  // Closed (an archived file, signed out): no React, Edit or Delete, as the box is a line (Decided 2026-10-17), and a
  // card's values are words, not pickers (Katerina, 30 Oct).
  const writable = !disabledReason
  // The file the conversation itself is on: its boxes give it no card.
  const boxHere = elsewhere ? file : here
  const common = { resolved, here, boxHere, nameOf, viewer, drafts, references, captions, closed: !writable }
  const toolsFor = (message: MessageData) => {
    const offered = writable && offersEditAndDelete({ viewer, author: message.by ?? '' })
    return {
      reactions: reactionsBy?.[message.id],
      onToggleReaction: writable && onReact ? (emoji: string, mine?: string) => onReact(message.id, emoji, mine) : undefined,
      onDelete: offered && onDeleteMessage ? () => onDeleteMessage(message.id) : undefined,
      onEdit: offered && onEditMessage ? (...edit: [body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string]) => onEditMessage(message.id, ...edit) : undefined,
    }
  }

  return (
    <Card fill="surface" className="flex flex-col gap-3 px-4 py-3" data-thread={thread.id}>
      {unreadFrom === thread.root.id && <NewSinceHere />}
      <Message message={thread.root} {...common} {...toolsFor(thread.root)} repliesLeftBehind={thread.replies.length} footer={<RepliesButton count={thread.replies.length} open={open} newCount={newCount} onToggle={toggle} />} />
      {open && (
        <div className="flex flex-col gap-3">
          {thread.replies.map((reply) => (
            <Fragment key={reply.id}>
              {unreadFrom === reply.id && <NewSinceHere />}
              <div className={REPLY_RULE}>
                <Message message={reply} {...common} {...toolsFor(reply)} />
              </div>
            </Fragment>
          ))}
          {/* Escape no longer closes an empty reply: the box's rule is that Escape cancels an edit only (approved Ship stories).
              Closed, no reply box at all: the start box's line already says why (the approved Ship story). */}
          {!disabledReason && (
            <Box
              key={thread.id}
              kind="reply"
              autoFocus={focusReply}
              draftKey={draftKeys.thread(thread.id)}
              drafts={drafts}
              upload={upload}
              nameOf={nameOf}
              resolved={resolved}
              here={boxHere}
              className="ml-2.5"
              references={references}
              captions={captions}
              onSend={(text, files, picks) => onReply(thread.id, text, files, picks)}
            />
          )}
        </div>
      )}
    </Card>
  )
}

const threadProps = (p: ThreadListViewProps | MentionListViewProps) => ({
  onReply: p.onReply,
  disabledReason: p.disabledReason,
  resolved: p.resolved,
  here: p.about,
  nameOf: p.nameOf,
  reactionsBy: p.reactionsBy,
  onReact: p.onReact,
  onDeleteMessage: p.onDeleteMessage,
  onEditMessage: p.onEditMessage,
  viewer: p.viewer,
  upload: p.upload,
  drafts: p.drafts,
})

/** The drawing, with the reads handed in — for a story, or a caller that has them. */
export function ThreadListView(props: ThreadListViewProps) {
  const { threads, onStart, disabledReason, className, unread, nameOf, about, omitted = 0, reactionsCut = false, upload, drafts, anchor, onDropAnchor } = props
  const scope = useMemo(() => messageScope(threads), [threads])
  const references = useCallback((query: string) => referenceSections(scope, query, nameOf), [scope, nameOf])
  const captions = useMemo(() => referenceCaptions(scope, nameOf), [scope, nameOf])
  const blockId = anchor && anchor.state !== 'unanchored' ? anchor.id : undefined
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* From a block's menu (RIC-18): the part this conversation will be about, as the posted comment shows it. */}
      {blockId && (
        <div className="flex items-start gap-2" data-pending-anchor={blockId}>
          <BlockAnchorNote anchor={anchor} className="min-w-0 flex-1" />
          {onDropAnchor && (
            <IconButton aria-label="Remove" tooltip="Remove" onClick={onDropAnchor}>
              <IconX size={16} stroke={1.5} />
            </IconButton>
          )}
        </div>
      )}
      <Box
        key={about}
        kind="conversation"
        onSend={(text, files, picks) => onStart(text, files, picks, blockId)}
        references={references}
        captions={captions}
        autoFocus={!!blockId}
        closed={disabledReason}
        draftKey={about && draftKeys.object(about)}
        drafts={drafts}
        upload={upload}
        nameOf={nameOf}
        resolved={props.resolved}
        here={about}
      />
      {props.loading ? (
        <SkeletonList rows={2} />
      ) : threads.length ? (
        <ol className="flex flex-col gap-3">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Thread thread={thread} pageThreads={threads} unread={unread?.[thread.id]} stillUnread={(props.stillUnread ?? unread)?.[thread.id]} judged={unread !== undefined} onShown={props.onThreadShown} {...threadProps(props)} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState scope="section" message="No conversations yet." />
      )}
      {omitted > 0 && (
        <p className="text-caption text-text-muted">
          Reactions are shown for the {REACTION_HORIZON} most recent messages. {omitted} older {omitted === 1 ? 'message was' : 'messages were'} not checked.
        </p>
      )}
      {reactionsCut && <p className="text-caption text-text-muted">Some reactions may be missing.</p>}
    </div>
  )
}

/** "Mentioned in": conversations elsewhere that name this object, each with where it lives. */
export function MentionListView(props: MentionListViewProps) {
  const { items, truncated = 0, className } = props
  const pageThreads = useMemo(() => items.map((item) => item.thread), [items])
  if (props.loading) return <SkeletonList rows={2} />
  if (!items.length) return <EmptyState scope="section" className={className} message="No related conversations yet." />
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ol className="flex flex-col gap-3">
        {items.map((item) => {
          const relation = RELATION[item.relation] ?? { label: item.relation, muted: true }
          return (
            <li key={item.thread.id} className="flex flex-col gap-1.5" data-relation={item.relation}>
              <p className={cn('flex min-w-0 items-center gap-1.5 text-caption', relation.muted ? 'text-text-muted' : 'text-text-secondary')}>
                {item.whereKind && <span className="flex shrink-0">{PLACE_ICON[item.whereKind]}</span>}
                {/* A place Ship cannot name gets no invented one (ActivityItem.where): the relation's words alone, as production had. */}
                {item.where ? (
                  <>
                    <span className="sr-only">{relation.label} </span>
                    <span className="truncate">{item.where}</span>
                  </>
                ) : (
                  <span>{relation.label}</span>
                )}
              </p>
              <Thread thread={item.thread} pageThreads={pageThreads} elsewhere file={item.file} {...threadProps(props)} disabledReason={item.closed ?? props.disabledReason} />
            </li>
          )
        })}
      </ol>
      <p className="text-caption text-text-muted">
        {truncated > 0 && `The ${items.length} most recent, of ${items.length + truncated}. The rest are on the issues themselves. `}
        What this reader can see. Conversations in Folders you cannot read are absent, without being counted.
      </p>
    </div>
  )
}

/**
 * A page's conversations: production's props, the surface's reads made once
 * (never per message — RIC-10, CON-2), and a reaction re-read from the relay
 * after it is written rather than patched on screen.
 */
export function ThreadList(props: ConversationsProps & Pick<ThreadListViewProps, 'upload' | 'drafts'>) {
  const { resolved } = useThreadReferences(props.threads)
  const { reactionsBy, omitted, cut, refresh } = useThreadReactions(props.threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        const answer = await props.onReact!(messageId, emoji, mine)
        if (answer === true) refresh()
        return answer
      }
    : undefined
  return <ThreadListView {...props} onReact={onReact} resolved={resolved}reactionsBy={reactionsBy} omitted={omitted} reactionsCut={cut} viewer={props.viewer ?? me} />
}

/** "Mentioned in" with production's `Activity` props and its reads. */
export function MentionList(props: ActivityProps & Pick<MentionListViewProps, 'upload' | 'drafts'>) {
  const threads = useMemo(() => props.items.map((item) => item.thread), [props.items])
  const { resolved } = useThreadReferences(threads)
  const { reactionsBy, refresh } = useThreadReactions(threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        const answer = await props.onReact!(messageId, emoji, mine)
        if (answer === true) refresh()
        return answer
      }
    : undefined
  return <MentionListView {...props} onReact={onReact} resolved={resolved}reactionsBy={reactionsBy} viewer={props.viewer ?? me} />
}
