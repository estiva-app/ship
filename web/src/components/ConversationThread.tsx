import { Fragment, useMemo, useState } from 'react'
import { IconDotsVertical, IconMoodPlus } from '@tabler/icons-react'
import type { BlockAnchor, Imeta } from '@estiva-app/protocol'
import { referencesIn, standaloneReference, toRenderTree } from '@estiva-app/protocol'
import { Card, Form } from '@estiva-app/ui'
import { Attachments as FileAttachments } from './ui/Attachment'
import { BlockAnchorNote } from './ui/BlockAnchorNote'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Textarea } from './ui/Textarea'
import { Divider } from './ui/Divider'
import { Menu, MenuItem } from './ui/Menu'
import { Popover } from './ui/Popover'
import { ReactionPicker } from './ui/ReactionPicker'
import { Toolbar, ToolbarButton } from './ui/Toolbar'
import { WithTooltip } from './ui/Tooltip'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { RichText } from '@/components/ui/RichText'
import { SkeletonBar } from '@/components/ui/Skeleton'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { Composer } from './Composer'
import { draftKeys } from '@/lib/drafts'
import { Reactions, REACTION_OPTIONS } from './Reactions'
import { useReactions, REACTION_TARGET_LIMIT } from '@/api'
import type { Reaction } from '@/api'

/**
 * Conversations as production shows them: a composer to start one, then
 * each thread as its own CARD — a hairline border, the surface background,
 * 10×12 padding (Katerina, 2026-08-27: "production has a different
 * background") — holding its root, its replies one level in behind a left
 * rule, and a reply line. Flat within a thread, as Peek shows them; never
 * deeper. Cards sit 10px apart.
 *
 * A message is a face and a name, the time, the body. The body is untrusted
 * text from other people and other apps, and it is drawn the way every other
 * body in this app is drawn — `toRenderTree` then `RichText`, safe by
 * construction (SPEC §13.5), never as markup. Ship-only: it knows what a
 * thread is.
 *
 * ## What SHI-1 was
 *
 * Katerina: *"Screenshots and reference widgets aren't rendered in conversation
 * or replies. Avatar + name + timestamp only."* The body reached here as a
 * plain `<p>`, and the caller had already deleted every `nostr:naddr…` from it
 * — so a comment whose whole content was a pointer at another object rendered
 * as an empty paragraph under a name and a time. Descriptions had had the
 * answer since PRO-7 and RIC-10; conversations had never been given it.
 *
 * `Description` is the sibling that already assembles these three pieces, and
 * the pairing is the same one: strip a standalone pointer out of the prose,
 * draw the object it names below, resolve an in-sentence pointer where it was
 * written. Showing the bech32 *and* the object is worse than either.
 *
 * **The screenshots half is answered too, now that there is something to
 * draw.** It could not be, at first: Peek's outbox published `content` and
 * nothing else, so an attachment stayed in Convex storage and never reached the
 * relay. peek#177 puts an `imeta` tag on the message (CON-12), `attachments.ts`
 * reads it back, and `Attachment` fetches the bytes — which it must, because
 * media GET is authenticated and an `<img src>` answers 401.
 */
export interface MessageData {
  id: string
  /**
   * Which block of the object this comment is about, already resolved against
   * the description as it is now — SPEC §13.6. Resolved by the caller because
   * only the page holds the description; see `threadFor`.
   */
  anchor?: BlockAnchor
  author: { name?: string; picture?: string }
  /** Seconds. */
  at: number
  /**
   * The body as it stands, minus the pointer at the object whose page this is —
   * see `omitOwnReference`. Every other reference is still in here and is drawn
   * as the object it names, not deleted.
   *
   * **This is the edited text where there is one** (CON-4). An edit replaces
   * the body and nothing else, and `threadFor` applies it, so nothing below has
   * to know an edit happened in order to draw the message correctly.
   */
  body: string
  /**
   * When it was last edited, in seconds — CON-4.
   *
   * Present only for an edited message, because "edited" is a thing a reader
   * MUST be told (RFC 0.4 §7.2.1): the original event is immutable and still on
   * the relay, so a body that quietly changed would leave two readers
   * disagreeing with no way to tell which is current.
   */
  editedAt?: number
  /** Author pubkey. Only used to decide unread — your own writing is never new. */
  by?: string
  /**
   * Files attached to this message, from its `imeta` tags — CON-12, SHI-1.
   *
   * Read beside the fold (`attachments.ts`) rather than off `Message`, for the
   * same reason as `editedAt`: `foldFolder` is a two-repo contract and a new
   * field on `Message` turns both repos red. `threadFor` supplies it.
   */
  files?: Imeta[]
}

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
const MESSAGE_FORMAT = 'marker' as const

/** Every `nostr:` pointer in a set of messages, deduplicated, in the order they appear. */
export function referencesInMessages(messages: readonly MessageData[]): string[] {
  const seen = new Set<string>()
  for (const message of messages) {
    for (const reference of referencesIn(toRenderTree(message.body, MESSAGE_FORMAT))) seen.add(reference)
  }
  return [...seen]
}

/**
 * Resolve every reference on a surface, once — for whoever is drawing threads.
 *
 * Both surfaces that draw threads need this and neither may do it per message:
 * `startConversation` appends the same pointer to every comment on an issue, so
 * a twelve-message thread would fetch one object twelve times, and because
 * `useForeignObjects` re-resolves on the page's own cadence two copies could
 * legitimately land in different states and draw the same object two ways on
 * one screen. RIC-10 extracted the hook for exactly that reason; this is the
 * thread-shaped caller of it, shared so `Conversations` and `Activity` cannot
 * drift into two answers.
 */
export function useThreadReferences(threads: readonly ThreadData[]): {
  resolved: Record<string, ForeignObjectData | null | undefined>
  resolving: boolean
} {
  const references = useMemo(
    () => referencesInMessages(threads.flatMap((thread) => [thread.root, ...thread.replies])),
    [threads],
  )
  const objects = useForeignObjects(references)
  return { resolved: byReference(references, objects), resolving: objects === undefined }
}

/**
 * The reactions on every message of a set of threads — SPEC §6.6, CON-2.
 *
 * Once per surface, not once per message: a `kind:7` is fetched addressed by
 * target, so one query covers a whole page (`#e` ORs — measured against
 * production, unlike `#h`, which does not). Asking per message would be one
 * round trip per line of conversation.
 *
 * Oldest first, because the horizon keeps the recent end when a page exceeds it
 * and the caller's order is what decides which end that is.
 *
 * Shared by `Conversations` and `Activity` for the same reason
 * `useThreadReferences` is: two copies of this would be two horizons and two
 * answers about the same messages on one screen.
 */
export function useThreadReactions(threads: readonly ThreadData[]): {
  reactionsBy: Record<string, readonly Reaction[]>
  omitted: number
  refresh: () => void
} {
  const ids = useMemo(
    () =>
      threads
        .flatMap((thread) => [thread.root, ...thread.replies])
        .sort((a, b) => a.at - b.at)
        .map((message) => message.id),
    [threads],
  )
  const { reactions, omitted, refresh } = useReactions(ids)
  return { reactionsBy: reactions, omitted, refresh }
}

export interface ThreadData {
  id: string
  root: MessageData
  replies: MessageData[]
}

/**
 * The one thing you can do to a message that is not a reaction — CON-3.
 *
 * ## Offered to everyone, decided by the relay
 *
 * There is no `author === me` here, and that is the whole point of the ticket.
 * Buzz honours a `kind:5` from the target's effective author **or** from the
 * NIP-OA owner of an authoring agent, and **no client can evaluate the second
 * half**: ownership is written from the attestation and read server-side only.
 * An app that gates on its own author check therefore hides the control from
 * the one *other* party the relay would accept — and on this workspace that is
 * where the conversation is: 425 of 583 messages on 2026-09-06 were written by
 * a single agent identity.
 *
 * So the control is offered, the write is attempted, and a refusal is shown in
 * the relay's own words. SPEC §6.5 said the opposite until 2026-09-06; SHI-14
 * found it wrong on objects, and this is the comment surface catching up.
 *
 * ## Why a menu and not a button
 *
 * `Menu`'s page: *"a click-opened list of actions: a `…` more-menu"*, rows
 * `destructive` in the error colour. Edit above Delete, and not destructive:
 * one changes what was said, the other takes it back, and the reversible one
 * goes first.
 *
 * ## The strip (0.10.0)
 *
 * Beside the menu sits "React", where Peek's card puts it (D34): the picker
 * opens above the button, the message being reacted to underneath (D30). Two
 * icon buttons side by side are a strip, and a strip is a `Toolbar` (B15):
 * one Tab stop, the arrow keys between them. `surface={false}` because the
 * card is the surface. The menu owns its trigger since 0.10.0 (B9), so the
 * open state, the `mousedown` guard and the `onClose` this used to keep are
 * gone — Base UI decides when it shows, and closes it when a row is chosen.
 */
export function MessageActions({
  onReact,
  onEdit,
  onDelete,
  disabledReason,
}: {
  onReact?: (emoji: string) => void
  onEdit?: () => void
  onDelete?: () => void
  disabledReason?: string
}) {
  const [picking, setPicking] = useState(false)
  return (
    <Toolbar aria-label="Message tools" surface={false} className="ml-auto shrink-0">
      {onReact && (
        <Popover
          side="top"
          align="right"
          ariaLabel="Reactions"
          className="w-auto min-w-0"
          // The 4px is the content's; on `className` it added to the package's
          // 8px from 0.12.6 on, and the picker grew 8px a side (migration docs
          // D68, Finding 60).
          contentClassName="p-1"
          open={picking}
          onOpenChange={setPicking}
          trigger={
            <ToolbarButton aria-label="React" tooltip="React" disabledReason={disabledReason}>
              <IconMoodPlus size={16} stroke={1.5} />
            </ToolbarButton>
          }
        >
          <ReactionPicker
            options={REACTION_OPTIONS}
            surface={false}
            onSelect={(emoji) => {
              setPicking(false)
              onReact(emoji)
            }}
          />
        </Popover>
      )}
      {(onEdit || onDelete) && (
        <Menu
          align="right"
          trigger={
            <ToolbarButton aria-label="Message actions" tooltip="Message actions" disabledReason={disabledReason}>
              {/* Vertical, as Peek's card draws its "more" (Katerina, 2026-09-08). */}
              <IconDotsVertical size={16} stroke={1.5} />
            </ToolbarButton>
          }
        >
          {onEdit && <MenuItem label="Edit message" onClick={onEdit} />}
          {onDelete && <MenuItem label="Delete message" destructive onClick={onDelete} />}
        </Menu>
      )}
    </Toolbar>
  )
}

/**
 * The question asked before a deletion, and the three things it has to say.
 *
 * A deletion is a **request**: the relay may decline it, and copies held by
 * another relay or another app's cache are untouched. That is not hedging — it
 * is the difference between this and archiving, which is the reversible,
 * attributable operation §6.5 still puts first.
 *
 * Deleting the **root** of a thread does not delete the thread: replies are
 * separate events with their own authors, and `foldConversations` promotes the
 * earliest surviving message to stand in for a root it cannot see. So the
 * conversation carries on without its opening line, which is worth knowing
 * before rather than after.
 */
function ConfirmDeleteMessage({
  replies,
  onConfirm,
  onClose,
}: {
  /** How many replies this message would leave behind — 0 unless it is a root. */
  replies: number
  onConfirm: () => Promise<boolean | void> | boolean | void
  onClose: () => void
}) {
  return (
    <ConfirmDialog title="Delete this message?" confirmLabel="Delete message" destructive onConfirm={onConfirm} onClose={onClose}>
      <p>
        This publishes a NIP-09 deletion request. The relay decides: it accepts one from the message&rsquo;s author, or from the
        owner of an agent that wrote it. Copies held by other relays or apps are unaffected.
      </p>
      {replies > 0 && (
        <p>
          Its {replies} {replies === 1 ? 'reply is a separate event and is' : 'replies are separate events and are'} not deleted.
          The conversation stays, opening with whichever message comes next.
        </p>
      )}
    </ConfirmDialog>
  )
}

/**
 * Editing a message in place — CON-4.
 *
 * A `Textarea` and two buttons rather than the rich composer, and that is the
 * §13.2 line rather than a shortcut: **a message is marker text**, so what is
 * edited is the text that was published. Handing it a rich editor would make
 * the round trip lossy in exactly the way `blockDocumentToMarkerText` exists to
 * avoid, and `RichText` draws the result the same either way.
 *
 * Seeded from the body as it currently stands — the *edited* text where there
 * is one, since editing an edit should start from what is on screen.
 *
 * **Kept open on a refusal.** `onSave` resolving `false` means the relay
 * declined, and closing would throw away what was typed to no purpose. Same
 * rule the composer and the delete dialog both keep.
 */
function EditMessage({
  body,
  onSave,
  onCancel,
}: {
  body: string
  onSave: (body: string) => Promise<boolean | void> | boolean | void
  onCancel: () => void
}) {
  const [text, setText] = useState(body)
  const [saving, setSaving] = useState(false)
  const unchanged = text.trim() === body.trim()

  const save = async () => {
    if (!text.trim() || unchanged) return
    setSaving(true)
    try {
      const ok = await onSave(text.trim())
      if (ok !== false) onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    // The package Form (UIG-7): Ctrl+Enter or Save saves; Enter in the text is a new line; it locks while saving.
    <Form busy={saving} onSubmit={save} className="flex flex-col gap-1.5" data-editing={body ? 'message' : 'message'}>
      <Textarea
        value={text}
        autoFocus
        rows={3}
        aria-label="Edit message"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Escape abandons, as it does in every other dismissible surface here.
          if (event.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="small" variant="primary" type="submit" disabled={saving || !text.trim() || unchanged}>
          Save
        </Button>
        <Button size="small" variant="muted" onClick={onCancel}>
          Cancel
        </Button>
        {/* An edit is a new event, and a reader who has not implemented 40003
            keeps showing the original — worth saying once, where it is done. */}
        <span className="text-caption text-text-muted">Publishes an edit; the original event stays on the relay.</span>
      </div>
    </Form>
  )
}

/**
 * One message or reply in a conversation: author, time, text, files, linked
 * items and reactions, with a menu to react, edit or delete it.
 */
export function MessageCard({
  message,
  reply = false,
  resolved,
  resolving = false,
  nameOf,
  reactions,
  onToggleReaction,
  onDelete,
  onEdit,
  repliesLeftBehind = 0,
  disabledReason,
}: {
  message: MessageData
  reply?: boolean
  /** The thread's references, resolved once by `Conversations` — RIC-10's rule. */
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** The first resolve is still in flight, so an attachment gets a skeleton rather than nothing. */
  resolving?: boolean
  /** Resolve a mentioned key to a name — SPEC §13.1. */
  nameOf?: (pubkey: string) => string
  /** This message's reactions, read by target — SPEC §6.6. */
  reactions?: readonly Reaction[]
  /** Add or take back a reaction on this message. Omitted where nobody may write. */
  onToggleReaction?: (emoji: string, mine?: string) => void
  /**
   * Publish a deletion for this message — CON-3.
   *
   * Resolves `false` when the relay refused, which keeps the dialog open so
   * the page's banner can say why. Omitted where nobody may write, which
   * removes the control rather than disabling it.
   */
  onDelete?: () => Promise<boolean | void> | boolean | void
  /**
   * Publish an edit of this message — CON-4.
   *
   * Takes the new body and resolves `false` when the relay refused, which keeps
   * the editor open with the text still in it. Omitted where nobody may write.
   *
   * No author gate, same as `onDelete`: the relay takes an edit from the
   * target's effective author or the NIP-OA owner of an authoring agent, and no
   * client can evaluate the second half.
   */
  onEdit?: (body: string) => Promise<boolean | void> | boolean | void
  /** Replies that would survive this message — only a thread root has any. */
  repliesLeftBehind?: number
  /** Why nothing can be written right now. */
  disabledReason?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const blocks = toRenderTree(message.body, MESSAGE_FORMAT)
  // A block that is nothing but one pointer is an attachment and is drawn
  // below; one inside a sentence is drawn where it was written (RIC-10).
  const attached = blocks.map(standaloneReference).filter((r): r is string => !!r)
  const attachments = attached.map((r) => resolved?.[r]).filter((o): o is ForeignObjectData => !!o)
  return (
    <article className={cn('flex flex-col gap-1 py-1.5', reply && 'ml-3.5 border-l-2 border-border-default pl-2.5')}>
      <BlockAnchorNote anchor={message.anchor} />
      <div className="flex items-center gap-1.5 text-caption text-text-muted">
        <Avatar name={message.author.name} src={message.author.picture} size={16} />
        <span className={cn('truncate', message.author.name ? 'text-text-secondary' : 'text-text-muted')}>{message.author.name ?? '—'}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{ago(message.at)}</span>
        {/*
          "edited", and the time it was edited rather than a bare word.

          RFC 0.4 §7.2.1 makes the marker a MUST: the original event is
          immutable and still on the relay, so a body that quietly changed
          leaves two readers disagreeing with nothing to tell them which is
          current. The `title` carries the detail so the line stays short.
        */}
        {message.editedAt !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <WithTooltip label={`Edited ${ago(message.editedAt)}`}>
              <span className="italic">edited</span>
            </WithTooltip>
          </>
        )}
        {(onDelete || onEdit || onToggleReaction) && (
          <MessageActions
            onReact={onToggleReaction && ((emoji) => onToggleReaction(emoji, reactions?.find((r) => r.emoji === emoji)?.mine))}
            onEdit={onEdit && (() => setEditing(true))}
            onDelete={onDelete && (() => setConfirming(true))}
            disabledReason={disabledReason}
          />
        )}
      </div>
      {confirming && onDelete && (
        <ConfirmDeleteMessage replies={repliesLeftBehind} onConfirm={onDelete} onClose={() => setConfirming(false)} />
      )}
      {editing && onEdit ? (
        <EditMessage body={message.body} onSave={onEdit} onCancel={() => setEditing(false)} />
      ) : (
      <RichText
        value={message.body}
        format={MESSAGE_FORMAT}
        /*
          Hide a standalone pointer only while there is still a card coming for
          it. `null` is the relay's real answer that nothing resolved — no card
          will be drawn below, so the chip stays and the message says something
          rather than rendering as a name and a time over a blank line. That is
          the half of SHI-1 a description never had to care about.
        */
        hideStandalone={(reference) => resolved?.[reference] !== null}
        nameOf={nameOf}
        resolved={resolved}
        className="break-words text-body-2 text-text-primary"
      />
      )}
      {/*
        Files, above the referenced objects — CON-12.

        `attachments` a few lines down is the OTHER kind: objects this message
        pointed at, which Ship has drawn since RIC-10. These are bytes somebody
        uploaded, and they go first because a screenshot is usually what the
        message is about while a pointer is usually what it is filed under.
      */}
      <FileAttachments files={message.files} className="mt-0.5" />
      {attached.length > 0 && resolving && <SkeletonBar className="h-16 w-full" data-foreign-references="loading" />}
      {attachments.length > 0 && (
        <div className="flex flex-col gap-2" data-foreign-references={String(attachments.length)}>
          {attachments.map((object) => (
            <ForeignObject key={object.ref} object={object} />
          ))}
        </div>
      )}
      {/* Under the body, above nothing — a reaction is about the message that
          precedes it, and it sits inside the article so it moves with it. */}
      <Reactions reactions={reactions} nameOf={nameOf} onToggle={onToggleReaction} disabledReason={disabledReason} />
    </article>
  )
}

/**
 * Where "new since you looked" begins (CRO-13).
 *
 * A rule rather than a badge: the divider sits above the first message the
 * reader has not seen, and everything below it is new. Ship's lists stay clean —
 * the signal lives where the reading happens.
 */
function NewSinceHere() {
  // The package's labelled Divider (0.11.0, D40), in the warning colour: the
  // accent this drew in measured 3.3:1 on Ship's background and could not
  // be read (Katerina, 2026-09-08); the warning colour measures 9.6:1.
  return <Divider label="New since you last read this" tone="warning" className="mx-0 py-1" />
}

/**
 * One conversation as a card: its first message, the replies below it, a line
 * where unread messages start, and a box to reply.
 */
export function ConversationThread({ thread, onReply, disabledReason, unreadFrom, resolved, resolving, nameOf, reactionsBy, onReact, onDeleteMessage, onEditMessage, subdued = false }: { thread: ThreadData; onReply: (threadId: string, text: string, files: readonly Imeta[]) => Promise<boolean | void> | boolean | void; disabledReason?: string; unreadFrom?: string; resolved?: Record<string, ForeignObjectData | null | undefined>; resolving?: boolean; nameOf?: (pubkey: string) => string; /** Reactions by message id, read once for the surface. */ reactionsBy?: Record<string, readonly Reaction[]>; /** Add or take back a reaction on one message. */ onReact?: (messageId: string, emoji: string, mine?: string) => void; /** Publish a deletion for one message — CON-3. Omitted where nobody may write. */ onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void; /** Publish an edit of one message — CON-4. Omitted where nobody may write. */ onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void; /** Draw it as secondary — Activity's mentions, which do not carry a comment's trust (CON-9). */ subdued?: boolean }) {
  return (
    // The card recedes rather than fading: no fill, so the subtle hairline sits
    // on the page's own ground, and it stays legible in either theme. An opacity
    // utility would have dimmed the text with it — UI-RULES §4.
    <Card fill={subdued ? 'none' : 'surface'} className="flex flex-col gap-1 px-3 py-2.5">
      {unreadFrom === thread.root.id && <NewSinceHere />}
      <MessageCard message={thread.root} resolved={resolved} resolving={resolving} nameOf={nameOf} reactions={reactionsBy?.[thread.root.id]} onToggleReaction={onReact && ((emoji, mine) => onReact(thread.root.id, emoji, mine))} onDelete={onDeleteMessage && (() => onDeleteMessage(thread.root.id))} onEdit={onEditMessage && ((body) => onEditMessage(thread.root.id, body))} repliesLeftBehind={thread.replies.length} disabledReason={disabledReason} />
      {thread.replies.map((reply) => (
        <Fragment key={reply.id}>
          {unreadFrom === reply.id && <NewSinceHere />}
          <MessageCard message={reply} reply resolved={resolved} resolving={resolving} nameOf={nameOf} reactions={reactionsBy?.[reply.id]} onToggleReaction={onReact && ((emoji, mine) => onReact(reply.id, emoji, mine))} onDelete={onDeleteMessage && (() => onDeleteMessage(reply.id))} onEdit={onEditMessage && ((body) => onEditMessage(reply.id, body))} disabledReason={disabledReason} />
        </Fragment>
      ))}
      <Composer kind="reply" onSubmit={(text, files) => onReply(thread.id, text, files)} disabledReason={disabledReason} draftKey={draftKeys.thread(thread.id)} className="ml-3.5 mt-1" />
    </Card>
  )
}

export interface ConversationsProps {
  threads: ThreadData[]
  /** Thread id → the id of its first unread message. Omitted threads have nothing new. */
  unread?: Record<string, string>
  /** The text and the files already on the relay — SHI-2. See `Composer`. */
  onStart: (text: string, files: readonly Imeta[]) => Promise<boolean | void> | boolean | void
  onReply: (threadId: string, text: string, files: readonly Imeta[]) => Promise<boolean | void> | boolean | void
  /** Why nothing can be posted right now — every composer here is disabled with it. */
  disabledReason?: string

  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  /**
   * The address of the object this surface is about — CON-10.
   *
   * Only the "start a conversation" composer needs it: a reply is keyed by its
   * own thread, which is the same destination wherever the thread is read.
   * Absent means no draft is kept for starting one, which is correct for a
   * surface that has no single object.
   */
  about?: string
  /**
   * Add or take back a reaction on one message — CON-2.
   *
   * Resolves when the relay has answered, so this surface can re-read rather
   * than assume. Omitted where nobody may write, which removes the controls
   * instead of disabling them.
   */
  onReact?: (messageId: string, emoji: string, mine?: string) => Promise<boolean | void> | boolean | void
  /**
   * Publish a deletion for one message — CON-3.
   *
   * Resolves `false` on a refusal, which is what keeps the confirm dialog open
   * so the page's banner can carry the relay's own words. Omitted where nobody
   * may write, and the control is then absent rather than disabled.
   */
  onDeleteMessage?: (messageId: string) => Promise<boolean | void> | boolean | void
  /**
   * Publish an edit of one message — CON-4.
   *
   * Resolves `false` on a refusal, which keeps the editor open with the text
   * still in it. Omitted where nobody may write, and the control is then absent
   * rather than disabled.
   */
  onEditMessage?: (messageId: string, body: string) => Promise<boolean | void> | boolean | void
  className?: string
}

/**
 * The conversations on an issue or project: a box to start one, then each
 * conversation as a card, or a line saying there are none yet.
 */
export function Conversations({ threads, onStart, onReply, disabledReason, className, unread, nameOf, about, onReact, onDeleteMessage, onEditMessage }: ConversationsProps) {
  const { resolved, resolving } = useThreadReferences(threads)
  const { reactionsBy, omitted, refresh: refreshReactions } = useThreadReactions(threads)

  /* Publish, then ask the relay again — never patch the count locally. The
     relay is the authority on whether a reaction happened, and `act` already
     keeps that rule for every other write here; a pill that moved on click and
     then snapped back would be worse than one that takes a moment. */
  const react = onReact
    ? async (messageId: string, emoji: string, mine?: string) => {
        await onReact(messageId, emoji, mine)
        refreshReactions()
      }
    : undefined

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>

      <Composer onSubmit={onStart} disabledReason={disabledReason} draftKey={about && draftKeys.object(about)} className="mb-1" />
      {threads.length ? (
        threads.map((thread) => (
          <ConversationThread
            key={thread.id}
            thread={thread}
            onReply={onReply}
            disabledReason={disabledReason}
            unreadFrom={unread?.[thread.id]}
            resolved={resolved}
            resolving={resolving}
            nameOf={nameOf}
            reactionsBy={reactionsBy}
            onReact={react}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
          />
        ))
      ) : (
        <EmptyState scope="section" message="No conversations yet." />
      )}
      {/*
        The horizon, said out loud — CON-1.

        §6.6's finding is that the cap is invisible: a message past it looks
        exactly like a message nobody reacted to. On this workspace it has never
        bitten (the busiest page is 77 messages against a limit of 100), which
        is precisely why the line has to exist before it does.
      */}
      {omitted > 0 && (
        <p className="text-caption text-text-muted">
          Reactions are shown for the {REACTION_TARGET_LIMIT} most recent messages. {omitted} older{' '}
          {omitted === 1 ? 'message was' : 'messages were'} not checked.
        </p>
      )}
    </div>
  )
}
