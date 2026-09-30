import { Fragment, Suspense, lazy, useMemo, useState, type ComponentProps } from 'react'
import { IconDotsVertical, IconMessage2, IconMoodPlus } from '@tabler/icons-react'
import type { Imeta } from '@estiva-app/protocol'
import { Avatar, Button, Card, EmptyState, IconButton, Menu, MenuItem, Popover, ReactionPicker, WithTooltip } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { draftKeys, type DraftStore } from '@/lib/drafts'
import { REACTION_TARGET_LIMIT, type Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { Attachments as FileAttachments } from '@/components/ui/Attachment'
import { BlockAnchorNote } from '@/components/ui/BlockAnchorNote'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { RichText } from '@/components/ui/RichText'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { REACTION_OPTIONS, Reactions } from '@/components/Reactions'
import { ConfirmDeleteMessage, NewSinceHere, useThreadReactions, useThreadReferences, type ConversationsProps, type MessageData, type ThreadData } from '@/components/ConversationThread'
import type { ActivityProps } from '@/components/Activity'
import { MESSAGE_FORMAT, PLACE_ICON, RELATION, Time, meaningLabel, standaloneReferencesOf, type MentionListViewProps, type ThreadListViewProps } from './shared'
import { MessageBoxShell } from './writingBox'

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
  const attached = standaloneReferencesOf(message.body)
  const objects = attached.map((r) => resolved?.[r]).filter((o): o is ForeignObjectData => !!o)
  const react = onToggleReaction && ((emoji: string) => onToggleReaction(emoji, reactions?.find((r) => r.emoji === emoji)?.mine))

  return (
    <article className="flex flex-col gap-2" data-message={message.id}>
      <BlockAnchorNote anchor={message.anchor} />
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
        <MessageBox kind="edit" autoFocus initial={message.body} nameOf={nameOf} drafts={drafts} onSubmit={(body) => onEdit(body)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="break-words">
            <RichText value={message.body} format={MESSAGE_FORMAT} hideStandalone={(reference) => resolved?.[reference] !== null} nameOf={nameOf} resolved={resolved} />
          </div>
          <FileAttachments files={message.files} />
          {attached.length > 0 && resolving && <SkeletonBar className="h-16 w-full" data-foreign-references="loading" />}
          {objects.length > 0 && (
            <div className="flex flex-col gap-2" data-foreign-references={String(objects.length)}>
              {objects.map((object) => (
                <ForeignObject key={object.ref} object={object} />
              ))}
            </div>
          )}
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
        {/* @estiva-escape(no-restyled-part): Button has no pressed state yet (IconButton has); a `pressed` Button is an estiva-ui candidate awaiting Katerina's call (30 September) */}
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
  onReply: (threadId: string, text: string, files: readonly Imeta[]) => Promise<boolean | void> | boolean | void
  disabledReason?: string
  unreadFrom?: string
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  nameOf?: (pubkey: string) => string
  reactionsBy?: Record<string, readonly Reaction[]>
  onReact?: (messageId: string, emoji: string, mine?: string) => void
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
}

/** Replies hang one step in, behind today's left rule. */
const REPLY_RULE = 'ml-2.5 border-l-2 border-border-default pl-3'

function Thread({ thread, onReply, disabledReason, unreadFrom, resolved, resolving, nameOf, reactionsBy, onReact, onDeleteMessage, onEditMessage, upload, drafts }: ThreadProps) {
  const unreadIndex = thread.replies.findIndex((r) => r.id === unreadFrom)
  const newCount = unreadIndex < 0 ? 0 : thread.replies.length - unreadIndex
  const [open, setOpen] = useState(newCount > 0)
  const [focusReply, setFocusReply] = useState(false)
  const toggle = () => {
    setFocusReply(!open)
    setOpen(!open)
  }
  const common = { resolved, resolving, nameOf, disabledReason, drafts }
  const toolsFor = (message: MessageData) => ({
    reactions: reactionsBy?.[message.id],
    onToggleReaction: onReact && ((emoji: string, mine?: string) => onReact(message.id, emoji, mine)),
    onDelete: onDeleteMessage && (() => onDeleteMessage(message.id)),
    onEdit: onEditMessage && ((body: string) => onEditMessage(message.id, body)),
  })

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
            onSubmit={(text, files) => onReply(thread.id, text, files)}
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
  upload: p.upload,
  drafts: p.drafts,
})

/** The drawing, with the reads handed in — for a story, or a caller that has them. */
export function ThreadListView(props: ThreadListViewProps) {
  const { threads, onStart, disabledReason, className, unread, nameOf, about, omitted = 0, upload, drafts } = props
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <MessageBox kind="conversation" onSubmit={onStart} disabledReason={disabledReason} draftKey={about && draftKeys.object(about)} drafts={drafts} upload={upload} nameOf={nameOf} />
      {threads.length ? (
        <ol className="flex flex-col gap-3">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Thread thread={thread} unreadFrom={unread?.[thread.id]} {...threadProps(props)} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState scope="section" message="No conversations yet." />
      )}
      {omitted > 0 && (
        <p className="text-caption text-text-muted">
          Reactions are shown for the {REACTION_TARGET_LIMIT} most recent messages. {omitted} older {omitted === 1 ? 'message was' : 'messages were'} not checked.
        </p>
      )}
    </div>
  )
}

/** "Mentioned in": conversations elsewhere that name this object, each with where it lives. */
export function MentionListView(props: MentionListViewProps) {
  const { items, truncated = 0, className } = props
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
              <Thread thread={item.thread} {...threadProps(props)} />
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
  const { reactionsBy, omitted, refresh } = useThreadReactions(props.threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        await props.onReact?.(messageId, emoji, mine)
        refresh()
      }
    : undefined
  return <ThreadListView {...props} onReact={onReact} resolved={resolved} resolving={resolving} reactionsBy={reactionsBy} omitted={omitted} />
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
  return <MentionListView {...props} onReact={onReact} resolved={resolved} resolving={resolving} reactionsBy={reactionsBy} />
}
