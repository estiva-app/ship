import type { ReactNode } from 'react'
import { IconBox, IconListDetails } from '@tabler/icons-react'
import { addressToPointer, cardsIn, encodeNaddr, encodeNevent, referencesIn, valueOfReference, type Embed, type Imeta, type LinkResolver, type PartPointer, type RenderBlock } from '@estiva-app/protocol'
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

/** One card a message asks for, with the `nostr:` reference its object is resolved under. */
export interface MessageCard extends Embed {
  reference: string
}

/**
 * The cards a message asks for — SPEC §13.6.2, OPT-16 — in body order, `none`
 * included (it draws nothing). The only cards a message draws (OPT-18). The
 * package's rule (`cardsIn`), so Peek reaches the same answer.
 *
 * Each is keyed by the reference the body wrote, so it resolves with the
 * chip. An app link names a card too once
 * `resolveLink` says what it names by §7.7 (OPT-17, `api/linkCards`); its card
 * resolves under the reference its value spells, since the body wrote only the URL.
 *
 * `blocks` is the body's tree after `linksAsReferences`, as Peek asks it.
 */
export function cardsOf(blocks: readonly RenderBlock[], embeds: readonly Embed[] | undefined, parts: readonly PartPointer[] = [], resolveLink?: LinkResolver): MessageCard[] {
  if (!embeds?.length) return []
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

const MARKER_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g
const BARE_URL = /https?:\/\/[^\s<>"'`]+/g
const TRAILING = /[.,;:!?)\]]+$/

/**
 * The URLs that may name a card: each link's target and each bare URL, never a
 * URL written in a link's label. The package's tree has no link mark, so
 * `cardsIn` sees a label's text too, and `[https://ship…/issue/x](https://elsewhere)`
 * would put that issue's card under a link that goes elsewhere (OPT-17's
 * security review). Peek's `findUrls` answers the same.
 *
 * At most `MAX_LINKS_PER_MESSAGE`, the first ones in that order, as Peek asks:
 * each claimed link is a relay query, and a message with hundreds would spend
 * every viewer's quota (OPT-18's security review). The rest stay links.
 */
export function linksNamingCards(body: string): Set<string> {
  const out = new Set<string>()
  for (const match of body.matchAll(MARKER_LINK)) if (/^https?:/i.test(match[1])) out.add(match[1])
  for (const url of body.replace(MARKER_LINK, ' ').match(BARE_URL) ?? []) out.add(url.replace(TRAILING, ''))
  return new Set([...out].slice(0, MAX_LINKS_PER_MESSAGE))
}

/** How many of a message's links are asked what they name — Peek's `MAX_LINKS_PER_MESSAGE`. */
export const MAX_LINKS_PER_MESSAGE = 8

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
