import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import { IconDotsVertical, IconMessage2, IconMoodPlus, IconX } from '@tabler/icons-react'
import { findNaddrs, pointerToAddress, referenceToPointer, type Imeta } from '@estiva-app/protocol'
import { Avatar, Button, Card, EmptyState, IconButton, Menu, MenuItem, Popover, ReactionPicker, WithTooltip } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { draftKeys, type DraftStore } from '@/lib/drafts'
import { offersEditAndDelete } from '@estiva-app/conversation'
import { REACTION_HORIZON, me, type Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { Attachments as FileAttachments } from '@/components/ui/Attachment'
import { BlockAnchorNote } from '@/components/ui/BlockAnchorNote'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { ShipRichText } from '@/components/ui/ShipRichText'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { REACTION_OPTIONS, Reactions } from '@/components/Reactions'
import { ConfirmDeleteMessage, NewSinceHere, useThreadReactions, useThreadReferences, type ConversationsProps, type MessageData, type ThreadData } from '@/components/ConversationThread'
import type { ActivityProps } from '@/components/Activity'
import { MESSAGE_FORMAT, PLACE_ICON, RELATION, Time, cardsOf, linkResolverFor, meaningLabel, type MentionListViewProps, type ThreadListViewProps } from './shared'
import { MessageBoxShell } from './writingBox'
import type { Picks } from './MessageBox'
import { messageScope, referenceSections } from '@/api/references'
import { shownParts } from '@/api/part'
import { knownLinkValue } from '@/api/linkCards'
import { PartCard } from '@/components/ui/PartCard'

/** The address a `nostr:` pointer names, or undefined for an event or a malformed one. */
function addressOf(reference: string): string | undefined {
  try {
    return pointerToAddress(referenceToPointer(reference))
  } catch {
    return undefined
  }
}

/** The objects a body names by a `nostr:` pointer, as addresses — one of the two ways it keeps a part shown. */
function namedAddresses(body: string): Set<string> {
  return new Set(findNaddrs(body).map(addressOf).filter((a): a is string => !!a))
}

/*
  The writing box is its own chunk: its editor is ProseMirror, which a reader
  must never download (RIC-14's rule for the description, kept). Until it lands
  the same-sized shell holds its place.
*/
const LazyMessageBox = lazy(() => import('./MessageBox'))
function MessageBox(props: ComponentProps<typeof LazyMessageBox>) {
  const shell = props.kind === 'edit' ? null : <MessageBoxShell kind={props.kind ?? 'conversation'} reason={props.disabledReason} className={props.className} />
  return (
    <Suspense fallback={shell}>
      <LazyMessageBox {...props} />
    </Suspense>
  )
}

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
 * signed fetch); linked items (`ForeignObject`, a skeleton while they resolve);
 * the note on a comment about one block; mentions by name; "edited" with when;
 * the reactions and their horizon line; "New since you last read this", with a
 * thread holding an unread reply opening by itself; the delete question with the
 * replies it leaves behind; edits and deletes kept open on a refusal; controls
 * absent where nobody may write and disabled with the reason where it is
 * momentary; drafts per thread and per object; the relation line on "Mentioned
 * in" with its note about what this reader cannot see. The writing box is
 * `MessageBox`, which publishes the same marker text the old field did.
 */

interface MessageProps {
  message: MessageData
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  nameOf?: (pubkey: string) => string
  reactions?: readonly Reaction[]
  onToggleReaction?: (emoji: string, mine?: string) => void
  onDelete?: () => Promise<boolean | void> | boolean | void
  onEdit?: (body: string) => Promise<boolean | void> | boolean | void
  repliesLeftBehind?: number
  disabledReason?: string
  drafts?: DraftStore
  /** A first message's second row: the replies button. */
  footer?: React.ReactNode
}

/** Add a reaction: the package IconButton, opening the package's picker. */
function AddReaction({ onPick, disabledReason }: { onPick: (emoji: string) => void; disabledReason?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      side="top"
      align="left"
      ariaLabel="Reactions"
      className="w-auto min-w-0"
      contentClassName="p-1"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <IconButton variant="muted" aria-label="React" tooltip="React" disabledReason={disabledReason}>
          <IconMoodPlus size={16} stroke={1.5} />
        </IconButton>
      }
    >
      <ReactionPicker
        options={REACTION_OPTIONS}
        surface={false}
        onSelect={(emoji) => {
          setOpen(false)
          onPick(emoji)
        }}
      />
    </Popover>
  )
}

function Message({ message, resolved, resolving, nameOf, reactions, onToggleReaction, onDelete, onEdit, repliesLeftBehind = 0, disabledReason, drafts, footer }: MessageProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // A block of another object, live (SPEC §13.6.1, COM-2).
  const parts = shownParts(message.parts, message.body, namedAddresses(message.body))
  // What each app link names by §7.7, from what the surface has asked: a bare link reads as that chip (OPT-18),
  // and a link on words can name its card (OPT-17).
  const resolveLink = linkResolverFor(message.body, knownLinkValue)
  // The cards its author asked for (SPEC §13.6.2, OPT-16) — the only cards a message draws. Every reference,
  // alone on its line too, is its chip in the text (OPT-18), and `none` leaves only that.
  const cards = cardsOf(message.body, message.embeds, parts, resolveLink)
  const shownCards = cards.flatMap((card) => {
    const object = card.layout === 'none' ? undefined : resolved?.[card.reference]
    return object ? [{ card, object }] : []
  })
  const react = onToggleReaction && ((emoji: string) => onToggleReaction(emoji, reactions?.find((r) => r.emoji === emoji)?.mine))

  return (
    <article className="flex flex-col gap-2" data-message={message.id}>
      {/* What a comment is about, above it: the anchored block, live, with the same card as a part (COM-2). */}
      {message.anchorPart ? <PartCard address={message.anchorPart.address} block={message.anchorPart.block} nameOf={nameOf} /> : <BlockAnchorNote anchor={message.anchor} />}
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
                <IconButton variant="muted" aria-label="Message actions" tooltip="Message actions" disabledReason={disabledReason}>
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
        <MessageBox kind="edit" autoFocus initial={message.body} initialUrgent={message.urgent} nameOf={nameOf} drafts={drafts} onSubmit={(body) => onEdit(body)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="break-words">
            <ShipRichText value={message.body} format={MESSAGE_FORMAT} resolveLink={resolveLink} nameOf={nameOf} resolved={resolved} urgent={message.urgent} />
          </div>
          <FileAttachments files={message.files} />
          {cards.some((card) => card.layout !== 'none') && resolving && <SkeletonBar className="h-16 w-full" data-foreign-references="loading" />}
          {shownCards.length > 0 && (
            <div className="flex flex-col gap-2" data-cards={String(shownCards.length)}>
              {shownCards.map(({ card, object }) => (
                <ForeignObject key={card.value} object={object} layout={card.layout === 'detailed' ? 'card' : 'row'} />
              ))}
            </div>
          )}
          {parts.map((part) => (
            <PartCard key={part.address} address={part.address} block={part.block} nameOf={nameOf} />
          ))}
          {/* Row one: the pills, then the add-reaction button (her note 4, Linear's order). Signed out, no button. */}
          {(react || !!reactions?.length) && (
            <div className="flex flex-wrap items-center gap-1">
              <Reactions reactions={reactions} nameOf={nameOf} onToggle={onToggleReaction} disabledReason={disabledReason} labelOf={meaningLabel} />
              {react && <AddReaction onPick={react} disabledReason={disabledReason} />}
            </div>
          )}
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
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<boolean | void> | boolean | void
  disabledReason?: string
  /** This thread's message ids that were new when the page opened, oldest first: the divider and opening by itself. */
  unread?: readonly string[]
  /** This thread's message ids still unread now, for "N new" (SHI-38). */
  stillUnread?: readonly string[]
  /** False while read state is loading: a thread drawn then opens by itself once it knows (99557309). */
  judged?: boolean
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  nameOf?: (pubkey: string) => string
  reactionsBy?: Record<string, readonly Reaction[]>
  onReact?: (messageId: string, emoji: string, mine?: string) => void
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
  viewer?: string
  onShown?: (threadId: string, open: boolean) => void
}

/** Replies hang one step in, behind today's left rule. */
const REPLY_RULE = 'ml-2.5 border-l-2 border-border-default pl-3'

function Thread({ thread, pageThreads, onReply, disabledReason, unread, stillUnread, judged = true, resolved, resolving, nameOf, reactionsBy, onReact, onDeleteMessage, onEditMessage, upload, drafts, viewer, onShown }: ThreadProps) {
  const references = useCallback((query: string) => referenceSections(messageScope(pageThreads, thread.id), query, nameOf), [pageThreads, thread.id, nameOf])
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
  const common = { resolved, resolving, nameOf, disabledReason, drafts }
  const toolsFor = (message: MessageData) => {
    const offered = offersEditAndDelete({ viewer, author: message.by ?? '' })
    return {
      reactions: reactionsBy?.[message.id],
      onToggleReaction: onReact && ((emoji: string, mine?: string) => onReact(message.id, emoji, mine)),
      onDelete: offered && onDeleteMessage ? () => onDeleteMessage(message.id) : undefined,
      onEdit: offered && onEditMessage ? (body: string) => onEditMessage(message.id, body) : undefined,
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
          <MessageBox
            kind="reply"
            autoFocus={focusReply}
            disabledReason={disabledReason}
            draftKey={draftKeys.thread(thread.id)}
            drafts={drafts}
            upload={upload}
            nameOf={nameOf}
            className="ml-2.5"
            references={references}
            onSubmit={(text, files, picks) => onReply(thread.id, text, files, picks)}
            onCancel={() => (setOpen(false), setFocusReply(false))}
          />
        </div>
      )}
    </Card>
  )
}

const threadProps = (p: ThreadListViewProps | MentionListViewProps) => ({
  onReply: p.onReply,
  disabledReason: p.disabledReason,
  resolved: p.resolved,
  resolving: p.resolving,
  nameOf: p.nameOf,
  reactionsBy: p.reactionsBy,
  onReact: p.onReact && ((id: string, emoji: string, mine?: string) => void p.onReact?.(id, emoji, mine)),
  onDeleteMessage: p.onDeleteMessage,
  onEditMessage: p.onEditMessage,
  viewer: p.viewer,
  upload: p.upload,
  drafts: p.drafts,
})

/** The drawing, with the reads handed in — for a story, or a caller that has them. */
export function ThreadListView(props: ThreadListViewProps) {
  const { threads, onStart, disabledReason, className, unread, nameOf, about, omitted = 0, reactionsCut = false, upload, drafts, anchor, onDropAnchor } = props
  const references = useCallback((query: string) => referenceSections(messageScope(threads), query, nameOf), [threads, nameOf])
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
      <MessageBox
        kind="conversation"
        onSubmit={(text, files, picks) => onStart(text, files, picks, blockId)}
        references={references}
        autoFocus={!!blockId}
        disabledReason={disabledReason}
        draftKey={about && draftKeys.object(about)}
        drafts={drafts}
        upload={upload}
        nameOf={nameOf}
      />
      {threads.length ? (
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
              <Thread thread={item.thread} pageThreads={pageThreads} {...threadProps(props)} />
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
  const { resolved, resolving } = useThreadReferences(props.threads)
  const { reactionsBy, omitted, cut, refresh } = useThreadReactions(props.threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        await props.onReact?.(messageId, emoji, mine)
        refresh()
      }
    : undefined
  return <ThreadListView {...props} onReact={onReact} resolved={resolved} resolving={resolving} reactionsBy={reactionsBy} omitted={omitted} reactionsCut={cut} viewer={props.viewer ?? me} />
}

/** "Mentioned in" with production's `Activity` props and its reads. */
export function MentionList(props: ActivityProps & Pick<MentionListViewProps, 'upload' | 'drafts'>) {
  const threads = useMemo(() => props.items.map((item) => item.thread), [props.items])
  const { resolved, resolving } = useThreadReferences(threads)
  const { reactionsBy, refresh } = useThreadReactions(threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        await props.onReact?.(messageId, emoji, mine)
        refresh()
      }
    : undefined
  return <MentionListView {...props} onReact={onReact} resolved={resolved} resolving={resolving} reactionsBy={reactionsBy} viewer={props.viewer ?? me} />
}
