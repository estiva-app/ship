import type { ReactNode } from 'react'
import { IconBox, IconListDetails } from '@tabler/icons-react'
import { addressToPointer, bech32Decode, cardsIn, convertBits, decodeNevent, encodeNaddr, encodeNevent, pointerToAddress, referencesIn, referenceToPointer, standaloneReference, toRenderTree, type Embed, type Imeta, type LinkResolver, type PartPointer } from '@estiva-app/protocol'
import { WithTooltip } from '@estiva-app/ui'
import { ago } from '@/lib/time'
import type { DraftStore } from '@/lib/drafts'
import type { Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { reactionName } from '@/components/Reactions'
import type { ConversationsProps } from '@/components/ConversationThread'
import type { ActivityProps, Relation } from '@/components/Activity'

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
export const MESSAGE_FORMAT = 'marker' as const

/**
 * The pointers standing alone on a line of a message: drawn below it as the
 * object they name, while a pointer inside a sentence stays where it was
 * written (RIC-10). The package's rule (`standaloneReference`), so Peek reaches
 * the same answer. Reading the tree only — `RichText` draws it.
 */
export function standaloneReferencesOf(body: string): string[] {
  return toRenderTree(body, MESSAGE_FORMAT)
    .map(standaloneReference)
    .filter((r): r is string => !!r)
}

/** One card a message asks for, with the `nostr:` reference its object is resolved under. */
export interface MessageCard extends Embed {
  reference: string
}

/**
 * The cards a message asks for — SPEC §13.6.2, OPT-16 — in body order, `none`
 * included (it draws nothing, but it overrides the lone-line card for its
 * value). The package's rule (`cardsIn`), so Peek reaches the same answer.
 *
 * Each is keyed by the reference the body wrote, so it resolves with the chip
 * and the lone-line card it may replace. An app link names a card too once
 * `resolveLink` says what it names by §7.7 (OPT-17, `api/linkCards`); its card
 * resolves under the reference its value spells, since the body wrote only the URL.
 */
export function cardsOf(body: string, embeds: readonly Embed[] | undefined, parts: readonly PartPointer[] = [], resolveLink?: LinkResolver): MessageCard[] {
  if (!embeds?.length) return []
  const blocks = toRenderTree(body, MESSAGE_FORMAT)
  const written = new Map<string, string>()
  for (const reference of referencesIn(blocks)) {
    const value = valueOfReference(reference)
    if (value && !written.has(value)) written.set(value, reference)
  }
  return cardsIn(embeds, blocks, parts, resolveLink).flatMap((card) => {
    const reference = written.get(card.value) ?? referenceOfValue(card.value)
    return reference ? [{ ...card, reference }] : []
  })
}

/** The app links a message's cards depend on: what `cardsIn` asks a resolver about, that may name one. None for a message with no `embed`. */
export function linksAskedFor(body: string, embeds: readonly Embed[] | undefined, parts: readonly PartPointer[] = []): string[] {
  if (!embeds?.length) return []
  const named = linksNamingCards(body)
  const asked: string[] = []
  cardsIn(embeds, toRenderTree(body, MESSAGE_FORMAT), parts, (url) => void (named.has(url) && asked.push(url)))
  return asked
}

const MARKER_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g
const BARE_URL = /https?:\/\/[^\s<>"'`]+/g
const TRAILING = /[.,;:!?)\]]+$/

/**
 * The URLs that may name a card: each link's target and each bare URL, never a
 * URL written in a link's label. The package's tree has no link mark, so
 * `cardsIn` sees a label's text too, and `[https://ship…/issue/x](https://elsewhere)`
 * would put that issue's card under a link that goes elsewhere (OPT-17's
 * security review). Peek's `findUrls` answers the same.
 */
export function linksNamingCards(body: string): Set<string> {
  const out = new Set<string>()
  for (const match of body.matchAll(MARKER_LINK)) if (/^https?:/i.test(match[1])) out.add(match[1])
  for (const url of body.replace(MARKER_LINK, ' ').match(BARE_URL) ?? []) out.add(url.replace(TRAILING, ''))
  return out
}

/** A `LinkResolver` for one message: what `known` says, for a URL that may name a card in its body. */
export function linkResolverFor(body: string, known: LinkResolver): LinkResolver {
  const named = linksNamingCards(body)
  return (url) => (named.has(url) ? known(url) : undefined)
}

/** The `nostr:` reference for an `embed` value — how a link's card resolves. Peek's `referenceOfValue`. */
export function referenceOfValue(value: string): string | undefined {
  if (/^[0-9a-f]{64}$/.test(value)) return `nostr:${encodeNevent({ id: value, relays: [] })}`
  try {
    return `nostr:${encodeNaddr(addressToPointer(value))}`
  } catch {
    return undefined
  }
}

/** The address or event id a `nostr:` reference names — what an `embed` carries for it. */
export function valueOfReference(reference: string): string | undefined {
  try {
    if (/^nostr:nevent1/i.test(reference)) return decodeNevent(reference).id.toLowerCase()
    if (/^nostr:naddr1/i.test(reference)) return pointerToAddress(referenceToPointer(reference))
    if (/^nostr:note1/i.test(reference)) {
      const { hrp, data } = bech32Decode(reference.slice('nostr:'.length).toLowerCase())
      const id = convertBits(data, 5, 8, false).map((b) => b.toString(16).padStart(2, '0')).join('')
      return hrp === 'note' && /^[0-9a-f]{64}$/.test(id) ? id : undefined
    }
  } catch {
    return undefined
  }
  return undefined
}

/** The time as "3h ago", and the date and time on hover (Katerina, 29 September). */
export function Time({ at }: { at: number }) {
  return (
    <WithTooltip label={new Date(at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}>
      <span className="whitespace-nowrap text-caption text-text-muted">{ago(at)}</span>
    </WithTooltip>
  )
}

/**
 * A reaction's tooltip in Peek's words: who, and what the reaction means —
 * "Ravi Mehta and Mara Sato reacted with Makes sense" (Katerina, 29 September:
 * the two apps say the same thing).
 */
export function meaningLabel(reaction: Reaction, nameOf?: (pubkey: string) => string): string {
  const names = reaction.by.map((pubkey) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who} reacted with ${reactionName(reaction.emoji)}`
}

/**
 * How a conversation elsewhere is related, in words for a screen reader —
 * "Mentioned in" is SPEC §6.4's phrase. A mention stays quieter than a
 * sub-file's thread (CON-9); Ship itself only produces mentions (PEE-26).
 */
export const RELATION: Record<Relation, { label: string; muted: boolean }> = {
  mention: { label: 'Mentioned in', muted: true },
  'sub-file': { label: 'On an issue', muted: false },
}

/** The icon Ship's sidebar gives each kind of place (Katerina, 29 September). */
export const PLACE_ICON: Record<'project' | 'issue', ReactNode> = {
  project: <IconBox size={14} stroke={1.5} />,
  issue: <IconListDetails size={14} stroke={1.5} />,
}

/**
 * What the drawing of a page's conversations needs: the page's own props, and
 * the reads the surface makes once for all of them. Split from the reads so a
 * story can hand them in without a relay.
 */
export interface ThreadListViewProps extends ConversationsProps {
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  reactionsBy?: Record<string, readonly Reaction[]>
  /** Messages past the reactions horizon — CON-1. */
  omitted?: number
  /** The reaction read came back at the relay's page ceiling, so some may be missing — SPEC §6.6. */
  reactionsCut?: boolean
  /** The upload behind attach. Injected so a story needs no relay. */
  upload?: (file: File) => Promise<Imeta>
  /** Where unsent text is kept — CON-10. Injected so a test needs no browser. */
  drafts?: DraftStore
}

export interface MentionListViewProps extends ActivityProps {
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  reactionsBy?: Record<string, readonly Reaction[]>
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
}
