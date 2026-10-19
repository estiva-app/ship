import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { KIND_BARE_FILE } from '@estiva-app/interop'
import { CardUnder, FieldLine, LinkChip, LinkRow, loadingShapeOf, type LinkState, type LinkedConversation, type LoadingShape } from '@estiva-app/ui'
import { applyCardAction, resolveForeign, type ForeignObject } from '@/api/foreign'
import { resolveFailed } from '@/api/useForeignObjects'
import { isReadableFolder, useFolderFiles } from '@/api/useFolderFiles'
import { useCardConversation } from '@/api/useCardConversation'
import { useWorkspacePeople } from '@/components/editing/mentionables'
import { cardShapeOf, noteCardShape, type CardShape } from '@/lib/cardShapes'
import { hrefOf, linkedKindOf, linkStateOf, notAvailable } from '@/lib/linked'
import { isOwnKind } from '@/lib/ownKinds'
import { blockLinkOf } from '@/lib/referenceLink'
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
 * them to `AppProvider`'s `navigate`.
 */
function LinkClicks({ block = false, children }: { block?: boolean; children: ReactNode }) {
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest('a')
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
  const block = link.state === 'ready' ? blockLinkOf(written) : undefined
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
  opensAt,
}: {
  uri: string
  object: ForeignObject | null | undefined
  nameOf?: (pubkey: string) => string
  urgent?: readonly string[]
  /** Hovering shows its card; off in a list of previews, where a card would cover the next one. */
  preview?: boolean
  /** The URL it was written as: a link to one block opens there (WBM-11). */
  opensAt?: string
}) {
  if (/^nostr:npub1/i.test(uri)) return <Reference uri={uri} nameOf={nameOf} urgent={urgent} />
  return (
    <LinkClicks>
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
  return (
    <LinkClicks block>
      <div data-link-row>
        <LinkRow link={unreadable ? notAvailable(uri) : openingAt(linkStateOf(uri, object), opensAt)} />
      </div>
    </LinkClicks>
  )
}

/** Where a file's comment count opens: a Ship file's Activity tab, anyone else's file in its own app. */
function conversationHref(object: ForeignObject): string {
  if (!isOwnKind(object.kind) || !object.address) return hrefOf(object)
  const d = object.address.split(':').slice(2).join(':')
  const title = object.slots.title
  const slug = title && !title.isPubkey ? title.value : undefined
  return object.kind === KIND.PROJECT ? href({ name: 'project', d, slug, view: 'table', tab: 'activity' }) : href({ name: 'issue', d, slug, tab: 'activity' })
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
}: {
  uri: string
  object: ForeignObject | null | undefined
  /** An old message's `compact` card: the file's row under the message, as it drew before the kit. */
  compact?: boolean
  /** ✕ on the card, offered to its message's author (Decided 19 Oct, WBM-7): the message then asks for no card. */
  onRemove?: () => void
}) {
  // A re-read after a change, until the conversation's next answer replaces it.
  const [after, setAfter] = useState<{ given: ForeignObject | null | undefined; object: ForeignObject | null }>()
  const object = after && after.given === given ? after.object : given
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
      try {
        const result = await applyCardAction({ reference: uri, actionId, value })
        if (!result.ok) {
          setError(result.reason)
          return
        }
        // Not patched on screen: the card shows what the relay now holds.
        const fresh = await resolveForeign(uri)
        setAfter({ given, object: fresh })
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [busy, uri, given],
  )

  const ready = object && !object.unreachable ? object : undefined
  if (ready && !compact && isReadableFolder(ready)) return <FolderCard uri={uri} folder={ready} error={error} onRemove={onRemove} />
  return <CardBox uri={uri} object={object} failed={failed} compact={compact} onAct={onAct} error={error} onRemove={onRemove} />
}

/** A linked Folder's card, with its files read for it alone (Miky, 16 Oct, ship#310). */
function FolderCard({ uri, folder, error, onRemove }: { uri: string; folder: ForeignObject; error?: string; onRemove?: () => void }) {
  return <CardBox uri={uri} object={useFolderFiles(uri, folder)} failed={false} compact={false} error={error} onRemove={onRemove} />
}

function CardBox({
  uri,
  object,
  failed,
  compact,
  onAct,
  error,
  onRemove,
}: {
  uri: string
  object: ForeignObject | null | undefined
  failed: boolean
  compact: boolean
  onAct?: (actionId: string, value: string) => void
  error?: string
  onRemove?: () => void
}) {
  const naddr = uri.replace(/^nostr:/i, '')
  const directory = useWorkspacePeople()
  const ready = object && !object.unreachable ? object : undefined
  // A Peek topic has no comments to count: it is the conversation itself.
  const counted = ready && !compact && ready.kind !== KIND_BARE_FILE ? ready.address : undefined
  const said = useCardConversation(counted)

  let link: LinkState | null
  let loadingShape: CardShape | undefined
  if (object === undefined) {
    // Found not available the last time this device asked: its one-line row from the first paint, not a card's height.
    // Otherwise a placeholder of the card's own height, so the conversation does not move as it loads.
    const kind = linkedKindOf(uri)
    loadingShape = rememberedUnavailable(naddr) || compact ? undefined : cardShapeOf(naddr, kind)
    link = rememberedUnavailable(naddr) ? notAvailable(uri) : { state: 'loading', kind, shape: loadingShape }
  } else if (failed) {
    // A failed read keeps what this device remembered, and otherwise draws nothing.
    link = rememberedUnavailable(naddr) ? notAvailable(uri) : null
  } else {
    const conversation: LinkedConversation | undefined = ready && said ? { count: said.count, href: conversationHref(ready), unread: said.unread } : undefined
    link = linkStateOf(uri, object, { directory, onAct, conversation })
  }

  /*
    The drawn card's shape and height, kept for its placeholder next time. The
    height holds what the shape cannot say: a summary the kit wraps to two lines.
  */
  const shape = !compact && link?.state === 'ready' ? loadingShapeOf(link.linked) : undefined
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
  if (!link) return null
  return (
    <LinkClicks block>
      <div ref={box} data-card={compact ? 'compact' : 'detailed'} data-card-value={naddr} style={loadingShape?.height ? { minHeight: loadingShape.height } : undefined}>
        {compact ? <LinkRow link={link} /> : <CardUnder link={link} onRemove={onRemove} revealOnHover />}
        {error && (
          <FieldLine tone="error" className="mt-1">
            {error}
          </FieldLine>
        )}
      </div>
    </LinkClicks>
  )
}
