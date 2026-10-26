import type { ReactNode } from 'react'
import { IconBox, IconListDetails } from '@tabler/icons-react'
import { addressToPointer, cardsIn, encodeNaddr, encodeNevent, referenceOfLink, referencesIn, valueOfReference, type Embed, type Imeta, type LinkResolver, type PartPointer, type RenderBlock } from '@estiva-app/protocol'
import { WithTooltip } from '@estiva-app/ui'
import { ago } from '@/lib/time'
import type { DraftStore } from '@/lib/drafts'
import type { Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import type { ConversationsProps } from '@/components/ConversationThread'
import type { ActivityProps, Relation } from '@/components/Activity'

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
export const MESSAGE_FORMAT = 'marker' as const

/** One card a message asks for, with the `nostr:` reference its object is resolved under. */
export interface MessageCard extends Embed {
  reference: string
  /** The first URL the body wrote for its file: the card opens it, as that file's chip would (LTX-6). */
  opensAt?: string
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
  // Only a URL that itself names that file, as a chip checks (LTX-6 security review).
  const writtenUrl = new Map<string, string>()
  const urlsIn = (bs: readonly RenderBlock[]) => {
    for (const block of bs) {
      for (const run of block.inline ?? []) {
        const names = resolveLink && run.reference && /^https?:\/\//i.test(run.text) && referenceOfLink(run.text, resolveLink) === run.reference
        const value = names && run.reference ? valueOfReference(run.reference) : undefined
        if (value && !writtenUrl.has(value)) writtenUrl.set(value, run.text)
      }
      if (block.children) urlsIn(block.children)
    }
  }
  urlsIn(blocks)
  return cardsIn(embeds, blocks, parts, resolveLink).flatMap((card) => {
    const reference = written.get(card.value) ?? referenceOfValue(card.value)
    const opensAt = writtenUrl.get(card.value)
    return reference ? [{ ...card, reference, ...(opensAt ? { opensAt } : {}) }] : []
  })
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

/** What a send carries beyond its text: whom it names urgently (SPEC §13.1), and the card the box showed under itself unless ✕ took it off (COMM-7). */
export interface Picks {
  urgent?: readonly string[]
  embeds?: readonly Embed[]
}

/**
 * What a write from the box answered: `true`, or the words for why the relay
 * said no, which the box says under itself with your words still in it — never
 * a toast (record a-refused-action-is-undone-and-your-text-comes-back).
 */
export type Answer = true | string

/** Whether an edit left a message's files as they were: the same blobs, in the same order. */
export const sameFiles = (a: readonly Imeta[], b: readonly Imeta[]) => a.length === b.length && a.every((file, i) => file.x === b[i].x)

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
  reactionsBy?: Record<string, readonly Reaction[]>
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
}
