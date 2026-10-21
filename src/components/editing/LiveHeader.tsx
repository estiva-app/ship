import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { linksAsReferences, referencesIn, resolveBlockAnchor, toRenderTree, type ContentFormat, type Imeta, type LinkResolver } from '@estiva-app/protocol'
import { BlockHandle } from '@estiva-app/ui'
import { Banner } from '@/components/Banner'
import { useLinkValues } from '@/api/linkCards'
import { referenceOfValue } from '@/components/conversations/shared'
import { blockRows, linkedBlock } from './blockRows'
import { ReadingSummary } from './ReadingSummary'
import { blockLineCards, linksInBlocks } from './DescriptionCards'
import { ShipRichText } from '@/components/ui/ShipRichText'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'

/*
  The editors are their own chunk, as `DescriptionEditing` was: ProseMirror and
  the schema are about 128 kB gzipped against an app that was 125 kB in all, and
  a reader must never download them. A writer gets them in the background; until
  they land the page shows the reading surface, which is the same pixels.
*/
const HeaderEditing = lazy(() => import('./HeaderEditing'))

export interface LiveHeaderProps {
  title: string
  titlePlaceholder: string
  onRename: (value: string) => Promise<boolean> | boolean
  /** The one-line summary under the title (SPEC §6.12); absent when it has none. */
  summary?: string
  /** Save the summary: `true`, or the words for why it was refused (`actInField`). Empty clears it. Omitted, the summary is text only. */
  onSummarize?: (value: string) => Promise<true | string>
  description: string
  format: ContentFormat
  /** The body, and the format tag the editor built it in — RIC-14. */
  onDescribe: (value: string, contentFormat?: string, left?: () => boolean) => Promise<boolean> | boolean
  /** Who saved the description last, by name, when it was not you: the "<name> saved a newer version" line (LTX-3). */
  descriptionBy?: string | null
  nameOf?: (pubkey: string) => string
  /** Title and description as text only, for a reader who cannot write. */
  readOnly?: boolean
  /** The upload behind `/` File. Injected so a story needs no relay. */
  upload?: (file: File) => Promise<Imeta>
  /** The block menu's Comment — offered to a reader too. Without it the row is not offered (RIC-18). */
  onCommentOnBlock?: (blockId: string) => void
  /** The block menu's Copy link: the page's copy, which confirms it. */
  onCopyBlockLink?: (link: string) => void
  /** Where the description's unsaved text is held when the sign-in ends (AUT-4). */
  holdKey?: string
}

/**
 * Opened from a block link (RIC-18): the block scrolled into view, or — when
 * that block is gone from the description — a notice saying so, as §13.6 asks
 * of a detached anchor. Once, for the description the page opened with.
 */
/** What a person does that means they have taken the page over from a block link's scroll. */
const PERSON = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

/** The page's path and fragment: a new one is a new arrival, a block link's included. */
const currentArrival = () => `${window.location.pathname}${window.location.hash}`
function subscribeArrival(changed: () => void): () => void {
  window.addEventListener('popstate', changed)
  window.addEventListener('hashchange', changed)
  return () => {
    window.removeEventListener('popstate', changed)
    window.removeEventListener('hashchange', changed)
  }
}

function useLinkedBlock(description: string, format: ContentFormat, readOnly: boolean): [missing: 'detached' | 'unaddressable' | null, dismiss: () => void] {
  const [missing, setMissing] = useState<'detached' | 'unaddressable' | null>(null)
  /*
    Where the page was arrived at: the URL, which a block link followed inside
    Ship changes without remounting the page (the router's `navigateTo`), so
    that is an arrival too (WBM-11).
  */
  const arrival = useSyncExternalStore(subscribeArrival, currentArrival)
  // Read at each tick, not at mount: whether this person may write can settle after the header has drawn.
  const writer = useRef(!readOnly)
  useEffect(() => {
    writer.current = !readOnly
  }, [readOnly])
  useEffect(() => {
    const id = linkedBlock()
    if (!id) return
    const state = resolveBlockAnchor(id, description, format).state
    // A removed block and a description with no parts are different facts (§13.6), so they are said differently.
    if (state === 'detached' || state === 'unaddressable') {
      setMissing(state)
      return
    }
    // The reading surface draws first and the editor replaces it, and the swap drops the scroll (measured on production:
    // scrolled on the reading surface, back at the top once the editor held the block). So each new copy of the block is
    // scrolled to, until the surface that stays — the editor, or the reading one for a reader — has it. Ten seconds, for
    // the editor's chunk on a slow first visit; and never after the person has scrolled or typed themselves.
    let tries = 0
    let scrolled: Element | null = null
    const stop = () => {
      clearInterval(timer)
      for (const type of PERSON) window.removeEventListener(type, stop, true)
    }
    const timer = setInterval(() => {
      const element = document.querySelector(`[data-description] [data-block-id="${CSS.escape(id)}"]`)
      if (element && element !== scrolled) {
        element.scrollIntoView({ block: 'center' })
        scrolled = element
      }
      if (element?.closest(`[data-description="${writer.current ? 'editing' : 'reading'}"]`) || ++tries >= 100) stop()
    }, 100)
    for (const type of PERSON) window.addEventListener(type, stop, { capture: true, passive: true })
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the description the link was opened on; a later edit is not a new arrival, a link followed here is
  }, [arrival])
  return [missing, () => setMissing(null)]
}

/**
 * The top of a project or an issue page: the title and the description, always
 * editable, with no box (Katerina, 29 September) — Notion's way: you read and
 * write in the same place. Enter in the title moves you into the description;
 * each saves when you leave it.
 *
 * A pointer is its chip wherever it was written, alone on its line too, and a
 * card is drawn after its line only where the writer chose one (SPEC §13.3,
 * Widgets): the editor's slots, or `blockLineCards` when only read. A reader
 * who cannot write gets text and no editor.
 */
export function LiveHeader(props: LiveHeaderProps) {
  const { description, format, nameOf, readOnly = false } = props
  const blocks = toRenderTree(description, format)
  // An app URL reads as the chip of what it names (Widgets): ask what each names, and resolve those with the rest.
  // Only the URLs asked (the first 24) are read as chips, so what is drawn is what is resolved.
  const linked = useLinkValues(linksInBlocks(blocks))
  const resolveLink: LinkResolver = (url) => linked.get(url)
  const references = referencesIn(linked.size ? linksAsReferences(blocks, resolveLink) : blocks)
  const objects = useForeignObjects(references)
  const resolved = byReference(references, objects)
  // Drawn as a chip only once its file has come back and can be read: until then, and for good when it cannot, the
  // URL as written (OPT-18, as a message reads; WBM-11), never a chip with nothing in it.
  const readable: LinkResolver = (url) => {
    const value = linked.get(url)
    const reference = value ? referenceOfValue(value) : undefined
    const object = reference ? resolved[reference] : undefined
    return object && !object.unreachable ? value : undefined
  }

  const [missing, dismiss] = useLinkedBlock(description, format, readOnly)

  const reading = <ReadingHeader {...props} resolved={resolved} resolveLink={readable} />
  return (
    <div className="flex flex-col gap-4">
      {missing && (
        <Banner tone="info" onDismiss={dismiss}>
          {missing === 'detached' ? 'That part of the description was removed.' : 'That link is to a part of the description, which is no longer written in parts.'}
        </Banner>
      )}
      {readOnly ? (
        reading
      ) : (
        <Suspense fallback={reading}>
          <HeaderEditing {...props} resolved={resolved} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * The same page as text: for a reader who cannot write, and for a writer in
 * the moment before the editor arrives. Laid out exactly as the editors are,
 * so nothing moves when they replace it.
 */
function ReadingHeader({ title, titlePlaceholder, summary, onSummarize, description, format, nameOf, readOnly, resolved, resolveLink, onCommentOnBlock, onCopyBlockLink }: LiveHeaderProps & { resolved: Record<string, ForeignObjectData | null | undefined>; resolveLink: LinkResolver }) {
  const empty = description.trim() === ''
  return (
    <div className="flex flex-col gap-4">
      {/* The title and the summary under it, 4px apart; the description 16px below (the short-summary prototype's ShipFilePage). */}
      <div className="flex flex-col gap-1">
        {/* No "Archived" chip beside the title: the Archived notice above it says so in words (Katerina, 30 September). */}
        <h1 className={title ? '-mx-2 px-2 py-1 text-h2 text-text-primary' : '-mx-2 px-2 py-1 text-h2 text-text-muted'}>{title || titlePlaceholder}</h1>
        {/* For a writer this is the moment before the editors arrive: the summary waits, unclickable, so nothing typed is
            lost when HeaderEditing replaces this header. */}
        <ReadingSummary value={summary ?? ''} waiting={!readOnly && !!onSummarize} />
      </div>
      <div className="-mx-2 px-2 py-1" data-description="reading">
        {empty ? (
          <span className="text-body-2 text-text-muted">{readOnly ? '' : 'Add a description…'}</span>
        ) : (
          // A reader gets the handle too, with Copy link and Comment (Miky, RIC-18 kickoff); the editing rows need the editor.
          <BlockHandle actions={blockRows(onCommentOnBlock, onCopyBlockLink)}>
            <ShipRichText value={description} format={format} nameOf={nameOf} resolved={resolved} resolveLink={resolveLink} renderAfter={(block) => blockLineCards(block, resolved)} />
          </BlockHandle>
        )}
      </div>
    </div>
  )
}
