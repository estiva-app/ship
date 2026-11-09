import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { Imeta } from '@estiva-app/protocol'
import { ConversationLayout, ConversationPlace, EmptyState, GONE_CLOSED, IconButton, SkeletonList, Thread as KitThread, type ConversationItem } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { appDrafts, draftKeys, type DraftStore } from '@/lib/drafts'
import { offersEditAndDelete, type RootState } from '@estiva-app/conversation'
import { REACTION_HORIZON, me, type Reaction, type Resolution } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { BlockAnchorNote } from '@/components/ui/BlockAnchorNote'
import { useThreadReactions, useThreadReferences, type ConversationsProps, type MessageData, type ThreadData } from '@/components/ConversationThread'
import type { ActivityItem, ActivityProps } from '@/components/Activity'
import { RELATION, type Answer, type MentionListViewProps, type Picks, type ThreadListViewProps } from './shared'
import { Box } from './lazyBox'
import { ShipComment, ShipReply } from './ThreadCards'
import { messageScope, referenceCaptions, referenceSections } from '@/api/references'
import { navigateTo } from '@/router'

/**
 * The conversations on a project or an issue, and the ones elsewhere that mention it, both on the kit's cards (ONE-6):
 *
 * - **The comments** (`ThreadListView`), the kit's one column beside the page (step 4c): each comment opens its
 *   thread under it, with Ship's reply box; Ship's words where the kit's differ.
 * - **"Mentioned in"** (`MentionListView`), in the Overview panel (step 4d), Peek's way: read-only, a press opens the
 *   page it was said on.
 *
 * Everything production's `Conversations` and `Activity` read is kept: the same reads (`useThreadReferences`,
 * `useThreadReactions`); files (`Attachments`, the signed fetch); linked files (the kit's chips, rows and cards); the
 * note on a comment about one block; mentions by name; "Edited" with when; the reactions and their horizon line; a
 * thread holding an unread reply opening by itself; the delete question with the replies it leaves behind; edits and
 * deletes kept open on a refusal; controls absent where nobody may write; drafts per thread and per object; the
 * mentions' note about what this reader cannot see. Every box is estiva-ui's `CommentBox` (`ConversationBox`).
 */

interface ThreadProps {
  thread: ThreadData
  /** Every thread on the page: what the reply box's `[` offers (CON-25). */
  pageThreads: readonly ThreadData[]
  onReply: (threadId: string, text: string, files: readonly Imeta[], picks?: Picks) => Promise<Answer>
  /** Why nothing can be written here: the reply box is a line saying it, and React, Edit and Delete are not offered. */
  disabledReason?: string
  /** This thread's message ids still unread now, for "N new" (SHI-38). */
  stillUnread?: readonly string[]
  resolved?: Record<string, ForeignObjectData | null | undefined>
  here?: string
  nameOf?: (pubkey: string) => string
  reactionsBy?: Record<string, readonly Reaction[]>
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<Answer>
  onResolve?: (threadId: string, resolved: boolean, note?: string) => Promise<Answer>
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  onEditMessage?: (messageId: string, body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string) => Promise<Answer>
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
  viewer?: string
}

const threadProps = (p: ThreadListViewProps) => ({
  onReply: p.onReply,
  disabledReason: p.disabledReason,
  resolved: p.resolved,
  here: p.about,
  nameOf: p.nameOf,
  reactionsBy: p.reactionsBy,
  onReact: p.onReact,
  onResolve: p.onResolve,
  onDeleteMessage: p.onDeleteMessage,
  onEditMessage: p.onEditMessage,
  viewer: p.viewer,
  upload: p.upload,
  drafts: p.drafts,
})

/** What `[` offers in a thread's boxes, and the captions its references open with: the page's messages, this thread's first. */
function useThreadScope(pageThreads: readonly ThreadData[], threadId: string, nameOf?: (pubkey: string) => string) {
  const scope = useMemo(() => messageScope(pageThreads, threadId), [pageThreads, threadId])
  const references = useCallback((query: string) => referenceSections(scope, query, nameOf), [scope, nameOf])
  const captions = useMemo(() => referenceCaptions(scope, nameOf), [scope, nameOf])
  return { references, captions }
}

interface ShipThreadProps extends ThreadProps {
  /** By thread id, each thread resolved in Peek or Leaf. */
  resolvedBy?: Record<string, Resolution>
  /** By thread id, each thread whose comment is gone, as the page's read found it. */
  goneBy?: Record<string, Exclude<RootState, 'present'>>
}

/** A gone comment's stand-in is its earliest reply: every message hangs under "This comment was deleted." or "can't be shown." (SPEC §6.5). */
const repliesOf = (thread: ThreadData) => (thread.rootMissing && !thread.held ? [thread.root, ...thread.replies] : thread.replies)

/** The reply box of this thread holds text (its draft keeps every change). */
const replyHoldsText = (threadId: string, drafts: DraftStore = appDrafts) => !!drafts.read(draftKeys.thread(threadId))?.trim()

/**
 * Whether a thread's comment is gone, and how (SPEC §6.5, ONE-9): `deleted` by its author, or `missing`, not readable
 * here. Until the page's read says which, it reads as deleted, as every such thread on production was (6 November).
 */
const goneOf = (thread: ThreadData, goneBy?: Record<string, Exclude<RootState, 'present'>>) => (thread.rootMissing ? (goneBy?.[thread.id] ?? 'deleted') : undefined)

/** Who replied, once each, for the replies row's faces. */
const facesOf = (replies: readonly MessageData[]) =>
  [...new Map(replies.map((reply) => [reply.by ?? reply.id, reply.author])).values()].map((author) => ({ name: author.name ?? '—', picture: author.picture, bot: author.bot }))

/** A message's own writes, offered only where Ship offers them: a writable page, and your own or your agent's (SHI-29). */
function toolsFor(message: MessageData, { disabledReason, viewer, reactionsBy, onReact, onDeleteMessage, onEditMessage }: ShipThreadProps) {
  const writable = !disabledReason
  const offered = writable && offersEditAndDelete({ viewer, author: message.by ?? '' })
  return {
    reactions: reactionsBy?.[message.id],
    onToggleReaction: writable && onReact ? (emoji: string, mine?: string) => onReact(message.id, emoji, mine) : undefined,
    onDelete: offered && onDeleteMessage ? () => onDeleteMessage(message.id) : undefined,
    onEdit: offered && onEditMessage ? (...edit: [body: string, removeCard?: string, files?: readonly Imeta[], dropped?: string]) => onEditMessage(message.id, ...edit) : undefined,
  }
}

/**
 * A conversation's comment, on the kit's card in the column (ONE-6, step 4c). The layout opens its thread: a press on
 * the card, its replies row, or Reply on the strip, so none of those is passed. A deleted comment says so, with no
 * React, Edit, Delete or Reply of its own (PER-24).
 */
function ShipThreadComment(props: ShipThreadProps) {
  const { thread, pageThreads, disabledReason, stillUnread, resolved, here, nameOf, viewer, drafts, resolvedBy, goneBy, onResolve } = props
  const { references, captions } = useThreadScope(pageThreads, thread.id, nameOf)
  const gone = goneOf(thread, goneBy)
  const deleted = gone !== undefined
  // Resolve and Reopen while the page takes writes, and never under a gone comment (SPEC §6.4, "What a thread offers").
  const resolves = !disabledReason && !deleted && onResolve ? (resolve: boolean, note?: string) => onResolve(thread.id, resolve, note) : undefined
  const replies = repliesOf(thread)
  const isNew = (id: string) => !!stillUnread?.includes(id)
  const last = replies.at(-1)
  return (
    <ShipComment
      message={thread.root}
      resolved={resolved}
      here={here}
      boxHere={here}
      nameOf={nameOf}
      viewer={viewer}
      drafts={drafts}
      references={references}
      captions={captions}
      closed={!!disabledReason}
      // A gone comment has nothing of its own to react to, edit or delete: its stand-in is a reply below.
      {...(deleted ? {} : toolsFor(thread.root, props))}
      deleted={gone === 'deleted'}
      unseen={gone === 'missing'}
      isNew={!deleted && isNew(thread.root.id)}
      repliesLeftBehind={thread.replies.length}
      replies={last ? { count: replies.length, faces: facesOf(replies), last: ago(last.at), newCount: replies.filter((reply) => isNew(reply.id)).length } : undefined}
      // A thread stays as its last resolve or reopen left it, its comment gone or not (SPEC §6.4).
      resolution={resolvedBy?.[thread.id]}
      onResolve={resolves}
    />
  )
}

/**
 * A conversation's thread, open under its comment: the replies on the kit's `ReplyCard`, then Ship's reply box, which
 * takes the caret each time the thread opens (the kit's one column). A deleted comment's thread takes no new reply.
 */
function ShipThreadReplies(props: ShipThreadProps) {
  const { thread, pageThreads, onReply, disabledReason, stillUnread, resolved, here, nameOf, viewer, drafts, upload } = props
  const { references, captions } = useThreadScope(pageThreads, thread.id, nameOf)
  const writable = !disabledReason
  const deleted = thread.rootMissing === true
  // A comment deleted while a reply to it is written keeps its box and the text; Send is then refused, saying why (ONE-10).
  const boxed = writable && (!deleted || replyHoldsText(thread.id, drafts))
  const common ={ resolved, here, boxHere: here, nameOf, viewer, drafts, references, captions, closed: !writable }
  return (
    <KitThread
      place="under"
      box={
        boxed ? (
          <Box
            key={thread.id}
            kind="reply"
            draftKey={draftKeys.thread(thread.id)}
            drafts={drafts}
            upload={upload}
            nameOf={nameOf}
            resolved={resolved}
            here={here}
            references={references}
            captions={captions}
            onSend={(text, files, picks) => onReply(thread.id, text, files, picks)}
          />
        ) : undefined
      }
      // Closed (an archived file, signed out): no box and no line; the start box's line already says why.
      notice={writable && !boxed ? GONE_CLOSED : undefined}
    >
      {repliesOf(thread).map((reply) => (
        <ShipReply key={reply.id} message={reply} {...common} {...toolsFor(reply, props)} isNew={!!stillUnread?.includes(reply.id)} />
      ))}
    </KitThread>
  )
}

/**
 * The drawing, with the reads handed in — for a story, or a caller that has them: the comments as the kit's one
 * column (ONE-6, step 4c), 384px beside the page, under the kit's own header, "Comments" and nothing more (Katerina,
 * 2 November: not whose they are). Each comment opens its thread under it, one at a time; resolved ones
 * wait closed under "Resolved" at the end, and ones on a block since deleted under "On deleted blocks" (the kit's);
 * the box is at the column's foot, with the block a comment will be about above it.
 */
export function ThreadListView(props: ThreadListViewProps) {
  const { threads: read, onStart, disabledReason, className, unread, nameOf, about, omitted = 0, reactionsCut = false, upload, drafts, anchor, onDropAnchor } = props
  const scope = useMemo(() => messageScope(read), [read])
  const references = useCallback((query: string) => referenceSections(scope, query, nameOf), [scope, nameOf])
  const captions = useMemo(() => referenceCaptions(scope, nameOf), [scope, nameOf])
  const blockId = anchor && anchor.state !== 'unanchored' ? anchor.id : undefined
  // One thread open at a time (the kit's one column keeps the press; the list keeps which).
  const [openId, setOpenId] = useState<string>()
  // At most one opens by itself: the newest holding a reply that was new when the page opened, once read state is known.
  const [openedByItself, setOpenedByItself] = useState(false)
  if (unread !== undefined && !openedByItself) {
    setOpenedByItself(true)
    const first = read.find((thread) => thread.replies.some((reply) => unread[thread.id]?.includes(reply.id)))
    if (first && openId === undefined) setOpenId(first.id)
  }
  /*
    The open thread as last read, and where it stood. A comment with no replies leaves the read the moment it is
    deleted; while its reply box holds text it stays where it was, as "This comment was deleted." with the box, so the
    text is not lost and Send says why it is refused (ONE-10, Decided 9 November). Emptied, closed or sent, it goes.
  */
  const [last, setLast] = useState<{ thread: ThreadData; at: number }>()
  const liveAt = openId === undefined ? -1 : read.findIndex((thread) => thread.id === openId)
  if (liveAt >= 0 && (last?.thread !== read[liveAt] || last.at !== liveAt)) setLast({ thread: read[liveAt]!, at: liveAt })
  const held = liveAt < 0 && last && last.thread.id === openId && replyHoldsText(openId, drafts) ? last : undefined
  const threads = useMemo(
    () => (held ? [...read.slice(0, held.at), { ...held.thread, replies: [], rootMissing: true as const, held: true as const }, ...read.slice(held.at)] : read),
    [read, held],
  )
  // An open thread is read as it is shown, as before (CON-34).
  const onShown = props.onThreadShown
  useEffect(() => {
    if (!openId || !onShown) return
    onShown(openId, true)
    return () => onShown(openId, false)
  }, [openId, onShown])
  const items: ConversationItem[] = threads.map((thread) => {
    const shared: ShipThreadProps = { thread, pageThreads: threads, stillUnread: (props.stillUnread ?? unread)?.[thread.id], resolvedBy: props.resolvedBy, goneBy: props.goneBy, ...threadProps(props) }
    return {
      id: thread.id,
      card: <ShipThreadComment {...shared} />,
      thread: () => <ShipThreadReplies {...shared} />,
      // Resolved in Peek or Leaf: closed under "Resolved", at the end (Katerina, 2 November).
      resolved: !!props.resolvedBy?.[thread.id],
      // On a block since removed from the description (§13.6): closed under "On deleted blocks", before "Resolved".
      gone: thread.root.anchor?.state === 'detached',
    }
  })
  const horizon = (omitted > 0 || reactionsCut) && (
    <>
      {omitted > 0 && (
        <p className="text-caption text-text-muted">
          Reactions are shown for the {REACTION_HORIZON} most recent messages. {omitted} older {omitted === 1 ? 'message was' : 'messages were'} not checked.
        </p>
      )}
      {reactionsCut && <p className="text-caption text-text-muted">Some reactions may be missing.</p>}
    </>
  )
  const box = (
    <div className="flex flex-col gap-2">
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
        // A new block to comment on is a new box, which takes the caret; the text typed so far is kept as a draft.
        key={`${about ?? ''}:${blockId ?? ''}`}
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
    </div>
  )
  return (
    <ConversationLayout
      // Opened by itself before it is drawn, so the thread the page opens does not take the caret from the page: drawn
      // again once the read state is known (the kit gives the caret only to a thread that opens after it is drawn).
      key={unread === undefined ? 'reading' : 'read'}
      threads="under"
      items={items}
      open={openId}
      onOpenChange={setOpenId}
      loading={props.loading}
      // Ship's words (Katerina, 2 November: Ship keeps its own where the kit differs).
      empty="No conversations yet."
      box={box}
      below={horizon}
      className={className}
    />
  )
}

/**
 * One conversation elsewhere that names this file, as Peek draws it (PEE-48): its comment on the kit's card,
 * read-only — no React, Edit, Delete or Reply, since the conversation is another file's — with its reactions, its
 * resolution and its replies row as they are. A press on it, or on its replies, opens the page it was said on, when
 * Ship has that page.
 */
function MentionCard({ item, here, nameOf, viewer, resolved, reactions, resolution, gone }: { item: ActivityItem; here?: string; nameOf?: (pubkey: string) => string; viewer?: string; resolved?: MentionListViewProps['resolved']; reactions?: readonly Reaction[]; resolution?: Resolution; gone?: Exclude<RootState, 'present'> }) {
  const { thread } = item
  const deleted = gone !== undefined
  const replies = repliesOf(thread)
  const last = replies.at(-1)
  const where = item.href
  return (
    <ShipComment
      message={thread.root}
      resolved={resolved}
      here={here}
      boxHere={item.file}
      nameOf={nameOf}
      viewer={viewer}
      closed
      reactions={reactions}
      deleted={gone === 'deleted'}
      unseen={gone === 'missing'}
      replies={last ? { count: replies.length, faces: facesOf(replies), last: ago(last.at) } : undefined}
      onClick={where ? () => navigateTo(where) : undefined}
      resolution={resolution}
    />
  )
}

/**
 * "Mentioned in", in the Overview panel (ONE-6, step 4d), Peek's way: each conversation elsewhere that names this
 * object, under the kit's `ConversationPlace` (how it is related, and where it was said), as a read-only card. Then
 * Ship's note on what this reader cannot see, and on the horizon.
 */
export function MentionListView(props: MentionListViewProps) {
  const { items, truncated = 0, className, about, nameOf, viewer, resolved, reactionsBy, resolvedBy, goneBy } = props
  if (props.loading) return <SkeletonList rows={2} />
  if (!items.length) return <EmptyState scope="section" className={className} message="No related conversations yet." />
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => (
        // A place Ship cannot name gets no invented one (ActivityItem.where): the chip alone.
        <ConversationPlace key={item.thread.id} relation={(RELATION[item.relation] ?? { label: item.relation }).label} place={item.where} data-relation={item.relation}>
          <MentionCard item={item} here={about} nameOf={nameOf} viewer={viewer} resolved={resolved} reactions={item.thread.rootMissing ? undefined : reactionsBy?.[item.thread.root.id]} resolution={resolvedBy?.[item.thread.id]} gone={goneOf(item.thread, goneBy)} />
        </ConversationPlace>
      ))}
      <p className="text-caption text-text-muted">
        {truncated > 0 && `The ${items.length} most recent, of ${items.length + truncated}. The rest are on the issues themselves. `}
        What this reader can see. Conversations in teams you cannot read are absent, without being counted.
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
  const { reactionsBy, omitted, cut, resolvedBy, goneBy, refresh } = useThreadReactions(props.threads)
  const onReact = props.onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        const answer = await props.onReact!(messageId, emoji, mine)
        if (answer === true) refresh()
        return answer
      }
    : undefined
  // A resolve or reopen is a kind:9101, read with the reactions: the same one request re-reads it.
  const onResolve = props.onResolve
    ? async (threadId: string, resolve: boolean, note?: string) => {
        const answer = await props.onResolve!(threadId, resolve, note)
        if (answer === true) refresh()
        return answer
      }
    : undefined
  return <ThreadListView {...props} onReact={onReact} onResolve={onResolve} resolved={resolved} reactionsBy={reactionsBy} resolvedBy={resolvedBy} goneBy={goneBy} omitted={omitted} reactionsCut={cut} viewer={props.viewer ?? me} />
}

/** "Mentioned in" with production's `Activity` props and its reads: the files they link, their reactions and resolutions. */
export function MentionList(props: ActivityProps) {
  const threads = useMemo(() => props.items.map((item) => item.thread), [props.items])
  const { resolved } = useThreadReferences(threads)
  const { reactionsBy, resolvedBy, goneBy } = useThreadReactions(threads)
  return <MentionListView {...props} resolved={resolved} reactionsBy={reactionsBy} resolvedBy={resolvedBy} goneBy={goneBy} viewer={props.viewer ?? me} />
}
