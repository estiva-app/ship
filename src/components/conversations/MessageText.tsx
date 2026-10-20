import type { ReactNode } from 'react'
import { findNaddrs, linksAsReferences, pointerToAddress, referenceToPointer, toRenderTree, type Embed, type PartPointer } from '@estiva-app/protocol'
import { RichText } from '@estiva-app/ui'
import type { ForeignObject } from '@/api/foreign'
import { knownLinkValue } from '@/api/linkCards'
import { shownParts } from '@/api/part'
import { MessageCard, MessageChip, MessagePart, MessageRow } from '@/components/ui/MessageLinks'
import { PartCard } from '@/components/ui/PartCard'
import { drawAttachment } from '@/components/ui/ShipRichText'
import { placeLines, ROW_BLOCK, type RowLine } from '@/lib/messageLines'
import { linkResolverFor } from '@/lib/linksNamingCards'
import { MESSAGE_FORMAT, cardsOf, referenceOfValue } from './shared'

/** The address a `nostr:` pointer names, or undefined for an event or a malformed one. */
function addressOf(reference: string): string | undefined {
  try {
    return pointerToAddress(referenceToPointer(reference))
  } catch {
    return undefined
  }
}

/**
 * A message's text with its links, then the cards its author chose and the
 * parts it shows — drawn as Peek's `MessageBody` draws them, from the same kit
 * and by the same rule (SPEC §13.2, §13.6; why:
 * https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md):
 * a link in a sentence is its chip, a line that is only a link to a file or a
 * message is that file's row, and the file whose card is under the message
 * draws nothing in the text, since the card stands for it.
 */
export function MessageText({
  body,
  embeds,
  parts: partTags,
  urgent,
  resolved,
  nameOf,
  here,
  preview = false,
  between,
  onRemoveCard,
}: {
  body: string
  /** The cards its author asked for, after edits (SPEC §13.6.2). */
  embeds?: readonly Embed[]
  /** Its `part` tags (SPEC §13.6.1). */
  parts?: readonly PartPointer[]
  urgent?: readonly string[]
  /** The conversation's one lookup of every reference, `undefined` while asked (RIC-10). */
  resolved?: Record<string, ForeignObject | null | undefined>
  nameOf?: (pubkey: string) => string
  /** The address of the file this conversation is on: no card for it there, its chip stays (WID-3). */
  here?: string
  /** A preview of the message (Related's rows): its links as chips only — no row, no card, no part (Decided 16 Oct). */
  preview?: boolean
  /** Drawn between the text and the cards: the message's files. */
  between?: ReactNode
  /** ✕ on a sent card, by its file: offered on your own message only, as Edit is (Decided 19 Oct, WBM-7). */
  onRemoveCard?: (value: string) => void
}) {
  // A block of another object, live (SPEC §13.6.1, COM-2), while the body still names it.
  const parts = preview ? [] : shownParts(partTags, body, new Set(findNaddrs(body).map(addressOf).filter((a): a is string => !!a)))
  // What each app link names by §7.7; a link to one block names its file, so it is that file's chip, the block live under the message (WBM-11).
  const claimed = linkResolverFor(body, knownLinkValue)
  // A bare link reads as that file's link once what it names has come back and can be read; until then, and for good
  // when it cannot, it stays the URL it was written as (OPT-18).
  const resolveLink = (url: string) => {
    const value = claimed(url)
    const reference = value ? referenceOfValue(value) : undefined
    const object = reference ? resolved?.[reference] : undefined
    return object && !object.unreachable ? value : undefined
  }
  const blocks = linksAsReferences(toRenderTree(body, MESSAGE_FORMAT), resolveLink)
  const isHere = (value: string) => !!here && value.toLowerCase() === here.toLowerCase()
  const cards = preview ? [] : cardsOf(blocks, embeds, parts, claimed).filter((card) => !isHere(card.value))
  const placed = preview ? undefined : placeLines(blocks, { cards, parts, resolveLink, stayChip: isHere })
  // A link to one block opens at the block (`opensAt`, the URL as written); any other where its file opens.
  const chip = (reference: string, written?: string) => <MessageChip uri={reference} object={resolved?.[reference]} nameOf={nameOf} urgent={urgent} preview={!preview} opensAt={written} />
  const row = (line: RowLine) => <MessageRow uri={line.reference} object={resolved?.[line.reference]} unreadable={line.unreadable} opensAt={line.url} />
  const shown = cards.filter((card) => card.layout !== 'none')
  return (
    <>
      {blocks.length > 0 && (
        <div className="break-words" data-message-text>
          <RichText
            blocks={placed?.blocks ?? blocks}
            renderReference={(reference, run) => {
              const line = placed?.rowRuns.get(run)
              return line ? row(line) : chip(reference, run.text)
            }}
            renderBlock={(block) => {
              const line = block.type === ROW_BLOCK ? placed?.rowOf(block) : undefined
              return line ? row(line) : drawAttachment(block)
            }}
          />
        </div>
      )}
      {between}
      {shown.length > 0 && (
        <div className="flex flex-col gap-2" data-cards={String(shown.length)}>
          {shown.map((card) => (
            <MessageCard
              key={card.value}
              uri={card.reference}
              object={resolved?.[card.reference]}
              compact={card.layout !== 'detailed'}
              onRemove={onRemoveCard && card.layout === 'detailed' ? () => onRemoveCard(card.value) : undefined}
              opensAt={card.opensAt}
            />
          ))}
        </div>
      )}
      {parts.map((part) => (
        <MessagePart key={part.address}>
          <PartCard address={part.address} block={part.block} nameOf={nameOf} />
        </MessagePart>
      ))}
    </>
  )
}
