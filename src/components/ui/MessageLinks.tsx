import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { KIND_BARE_FILE } from '@estiva-app/interop'
import { AttachedCard, FieldLine, LinkChip, LinkRow, loadingShapeOf, type LinkState, type LinkedConversation, type LoadingShape } from '@estiva-app/ui'
import { applyCardAction, resolveForeign, type ForeignObject } from '@/api/foreign'
import { resolveFailed } from '@/api/useForeignObjects'
import { isReadableFolder, useFolderFiles } from '@/api/useFolderFiles'
import { useCardConversation } from '@/api/useCardConversation'
import { useParentArchive } from '@/api/useParentArchive'
import { useWorkspacePeople } from '@/components/editing/mentionables'
import { cardShapeOf, noteCardShape, type CardShape } from '@/lib/cardShapes'
import { hrefOf, linkedKindOf, linkStateOf, notAvailable } from '@/lib/linked'
import { isOwnKind } from '@/lib/ownKinds'
import { writtenLink } from '@/api/linkCards'
import { noteCardAvailability, rememberedUnavailable } from '@/lib/unavailableCards'
import { KIND } from '@/nostr/kinds'
import { href } from '@/router'
import { Reference } from './Reference'

/*
  A message's links, drawn by the kit (`@estiva-app/ui` 0.75): a chip in a
  sentence, a row alone on its line, the card its author chose under the
  message — Peek's `MessageLinks.tsx`, so one body draws the same in both apps
  (why:
  https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md).
  Ship adds what only it knows: where its own files open, and how it writes a
  change.
*/

const isModified = (event: MouseEvent) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

/**
 * Another app's address opens in a new tab: a stranger published it into a
 * shared relay, hence `noopener`. Ship's own go through the kit, which hands
 * them to `AppProvider`'s `navigate`. With `follows` off, a click opens
 * nothing: in a box being written in, it is not a way out of the draft.
 */
export function LinkClicks({ block = false, follows = true, children }: { block?: boolean; follows?: boolean; children: ReactNode }) {
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest('a')
    if (anchor && !follows) {
      event.preventDefault()
      return
    }
    if (!anchor || isModified(event) || anchor.getAttribute('target')) return
    let url: URL
    try {
      url = new URL(anchor.getAttribute('href') ?? '', window.location.href)
    } catch {
      return
    }
    if (url.origin === window.location.origin) return
    event.preventDefault()
    window.open(url.href, '_blank', 'noopener,noreferrer')
  }
  return block ? <div onClickCapture={onClickCapture}>{children}</div> : <span onClickCapture={onClickCapture}>{children}</span>
}

/** A file's link state, opening at the block a link to one block was written for (§13.6.1). */
function openingAt(link: LinkState, written: string | undefined): LinkState {
  const block = link.state === 'ready' ? writtenLink(written, link.linked.href) : undefined
  return block && link.state === 'ready' ? { ...link, linked: { ...link.linked, href: block.href } } : link
}

/** A part of another file shown in a message (SPEC §13.6.1): its links are clicked as a chip's are. */
export function MessagePart({ children }: { children: ReactNode }) {
  return <LinkClicks block>{children}</LinkClicks>
}

/**
 * A reference in a sentence: the kit's chip, or a person's, which the kit has
 * no kind for. `object` is the body's one lookup (`undefined` while asked), so
 * the same file never draws in two states on one screen.
 */
export function MessageChip({
  uri,
  object,
  nameOf,
  urgent,
  preview = true,
  follows = true,
  opensAt,
}: {
  uri: string
  object: ForeignObject | null | undefined
  nameOf?: (pubkey: string) => string
  urgent?: readonly string[]
  /** Hovering shows its card; off in a list of previews, where a card would cover the next one, and in a box being written in. */
  preview?: boolean
  /** A click opens it; off in a box being written in, where a click is not a way out of the draft (Katerina, 30 Oct). */
  follows?: boolean
  /** The URL it was written as: a link to one block opens there (WBM-11). */
  opensAt?: string
}) {
  if (/^nostr:npub1/i.test(uri)) return <Reference uri={uri} nameOf={nameOf} urgent={urgent} />
  return (
    <LinkClicks follows={follows}>
      <LinkChip link={openingAt(linkStateOf(uri, object), opensAt)} preview={preview} />
    </LinkClicks>
  )
}

/** A line that is only a link to a file or a message: that file's row, where the line was. */
export function MessageRow({
  uri,
  object,
  unreadable = false,
  opensAt,
}: {
  uri: string
  object: ForeignObject | null | undefined
  /** A reference that names no address or event id. */
  unreadable?: boolean
  /** The URL it was written as: a link to one block opens there (WBM-11). */
  opensAt?: string
}) {
  const conversation = useConversationOf(unreadable ? undefined : object)
  return (
    <LinkClicks block>
      <div data-link-row>
        <LinkRow link={unreadable ? notAvailable(uri) : openingAt(linkStateOf(uri, object, { conversation }), opensAt)} />
      </div>
    </LinkClicks>
  )
}

/** Where a file's comment count opens: a Ship file's Activity tab, anyone else's file in its own app. */
export function conversationHref(object: ForeignObject): string {
  if (!isOwnKind(object.kind) || !object.address) return hrefOf(object)
  const d = object.address.split(':').slice(2).join(':')
  const title = object.slots.title
  const slug = title && !title.isPubkey ? title.value : undefined
  return object.kind === KIND.PROJECT ? href({ name: 'project', d, slug, view: 'table', tab: 'activity' }) : href({ name: 'issue', d, slug, tab: 'activity' })
}

/**
 * The comment count a file's row and card show, opening its conversation (Katerina, 30 Oct: on rows too), with the
 * dot only for a member with something unread. None for a file that cannot be read, a message, or a Peek topic,
 * which is the conversation itself.
 */
function useConversationOf(object: ForeignObject | null | undefined): LinkedConversation | undefined {
  const ready = object && !object.unreachable ? object : undefined
  const said = useCardConversation(ready && ready.kind !== KIND_BARE_FILE ? ready.address : undefined)
  const href = ready ? conversationHref(ready) : ''
  // Only where there is a conversation to open.
  return ready && said && href ? { count: said.count, href, unread: said.unread } : undefined
}

/**
 * The card its author chose under a message (SPEC §13.6.2), with no ✕: taking
 * a card off a sent message is the message box's. Any reader may change the
 * file from it (Decided 16 Oct), each change written and read back, since the
 * relay is the authority on whether it happened. Its comment count shows the
 * dot only for a member with something unread (record
 * membership-replaces-following).
 *
 * `object` is the conversation's one lookup of it (`undefined` while asked):
 * the chip of the same file elsewhere on the page draws from the same answer.
 */
export function MessageCard({
  uri,
  object: given,
  compact = false,
  onRemove,
  opensAt,
  words = false,
}: {
  uri: string
  object: ForeignObject | null | undefined
  /** An old message's `compact` card: the file's row under the message, as it drew before the kit. */
  compact?: boolean
  /** Its values as words, no pickers: where the reader cannot act — a closed conversation, a description only read (Katerina, 30 Oct). */
  words?: boolean
  /** ✕ on the card, offered to its message's author (Decided 19 Oct, WBM-7): the message then asks for no card. */
  onRemove?: () => void
  /** The URL the body wrote for its file: a click opens it, as the file's chip would (LTX-6). */
  opensAt?: string
}) {
  // A re-read after a change, until the conversation's next answer replaces it.
  const [after, setAfter] = useState<{ given: ForeignObject | null | undefined; object: ForeignObject | null }>()
  // The pick shows at once and is held until that re-read lands, as in Leaf (5ebf2756).
  const [chosen, choose] = useState<{ actionId: string; value: string } | null>(null)
  const shown = after && after.given === given ? after.object : given
  /*
    Whether its parent is archived (an issue in an archived project), read once
    for the card rather than on the conversation's 10 s refresh, which would pay
    one more request per link each tick (SHI-13). Its values then read as words,
    as Leaf's do (5ebf2756).
  */
  const withParent = useParentArchive(uri, !compact && !words && !!shown && !shown.unreachable && !shown.archived && !!shown.parentRef)
  const read = shown && withParent && !shown.archived ? { ...shown, archived: withParent } : shown
  const object = read && chosen ? { ...read, actions: read.actions.map((one) => (one.id === chosen.actionId ? { ...one, current: chosen.value } : one)) } : read
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const naddr = uri.replace(/^nostr:/i, '')
  // A failed read (a 429, the network) is not an answer: it says neither "not available" nor "available again".
  const failed = object === null && resolveFailed(uri)
  const availability = object === undefined || failed ? undefined : !!object && !object.unreachable
  useEffect(() => {
    if (availability !== undefined) noteCardAvailability(naddr, availability)
  }, [availability, naddr])

  const onAct = useCallback(
    async (actionId: string, value: string) => {
      if (busy) return
      setBusy(true)
      setError(undefined)
      choose({ actionId, value })
      try {
        const result = await applyCardAction({ reference: uri, actionId, value })
        if (!result.ok) {
          setError(result.reason)
          return
        }
        // Then what the relay now holds.
        const fresh = await resolveForeign(uri)
        setAfter({ given, object: fresh })
      } catch (e) {
        setError((e as Error).message)
      } finally {
        choose(null)
        setBusy(false)
      }
    },
    [busy, uri, given],
  )

  const ready = object && !object.unreachable ? object : undefined
  if (ready && !compact && isReadableFolder(ready)) return <FolderCard uri={uri} folder={ready} error={error} onRemove={onRemove} opensAt={opensAt} />
  return <CardBox uri={uri} object={object} failed={failed} compact={compact} onAct={words ? undefined : onAct} error={error} onRemove={onRemove} opensAt={opensAt} />
}

/** A linked Folder's card, with its files read for it alone (Miky, 16 Oct, ship#310). */
function FolderCard({ uri, folder, error, onRemove, opensAt }: { uri: string; folder: ForeignObject; error?: string; onRemove?: () => void; opensAt?: string }) {
  return <CardBox uri={uri} object={useFolderFiles(uri, folder)} failed={false} compact={false} error={error} onRemove={onRemove} opensAt={opensAt} />
}

function CardBox({
  uri,
  object,
  failed,
  compact,
  onAct,
  error,
  onRemove,
  opensAt,
}: {
  uri: string
  object: ForeignObject | null | undefined
  failed: boolean
  compact: boolean
  onAct?: (actionId: string, value: string) => void
  error?: string
  onRemove?: () => void
  opensAt?: string
}) {
  const naddr = uri.replace(/^nostr:/i, '')
  const directory = useWorkspacePeople()
  // An old compact card is the file's row, and a row has the count too (Katerina, 30 Oct).
  const conversation = useConversationOf(object)

  let link: LinkState
  let loadingShape: CardShape | undefined
  if (object === undefined) {
    // Found not available the last time this device asked: its one-line row from the first paint, not a card's height.
    // Otherwise a placeholder of the card's own height, so the conversation does not move as it loads.
    const kind = linkedKindOf(uri)
    loadingShape = rememberedUnavailable(naddr) || compact ? undefined : cardShapeOf(naddr, kind)
    link = rememberedUnavailable(naddr) ? notAvailable(uri) : { state: 'loading', kind, shape: loadingShape }
  } else if (failed) {
    // A failed read (a busy relay, the network) with nothing to show draws the not-available row, never nothing, and
    // the page's refresh keeps asking quietly (Katerina, 30 Oct). It is not remembered: it is not an answer.
    link = notAvailable(uri)
  } else {
    link = openingAt(linkStateOf(uri, object, { directory, onAct, conversation }), opensAt)
  }

  /*
    The drawn card's shape and height, kept for its placeholder next time. The
    height holds what the shape cannot say: a summary the kit wraps to two lines.
  */
  const shape = !compact && link.state === 'ready' ? loadingShapeOf(link.linked) : undefined
  const shapeKey = shape && JSON.stringify(shape)
  const box = useRef<HTMLDivElement>(null)
  const kindOfCard = linkedKindOf(uri)
  useEffect(() => {
    const card = box.current?.firstElementChild
    if (!shapeKey || !card) return
    const drawn = JSON.parse(shapeKey) as LoadingShape
    // A card not on screen (a closed tab) measures 0: it keeps the height it last drew at.
    const note = () => {
      const height = Math.round(card.getBoundingClientRect().height)
      noteCardShape(naddr, height > 0 ? { ...drawn, height } : { ...drawn, height: cardShapeOf(naddr, kindOfCard)?.height })
    }
    note()
    if (typeof ResizeObserver === 'undefined') return
    // A window being resized changes every card's height each frame: note it once it settles.
    let settle: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(settle)
      settle = setTimeout(note, 500)
    })
    observer.observe(card)
    return () => {
      observer.disconnect()
      clearTimeout(settle)
    }
  }, [naddr, shapeKey, kindOfCard])
  return (
    <LinkClicks block>
      <div ref={box} data-card={compact ? 'compact' : 'detailed'} data-card-value={naddr} style={loadingShape?.height ? { minHeight: loadingShape.height } : undefined}>
        {compact ? <LinkRow link={link} /> : <AttachedCard link={link} onRemove={onRemove} />}
        {error && (
          <FieldLine tone="error" className="mt-1">
            {error}
          </FieldLine>
        )}
      </div>
    </LinkClicks>
  )
}
