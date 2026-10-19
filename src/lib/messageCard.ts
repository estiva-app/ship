/**
 * Which file's card a comment sent or edited from Ship carries (SPEC §13.6.2;
 * why:
 * https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md).
 *
 * Peek's box rule (`src/lib/boxCard.ts` there), over the same protocol helpers,
 * so a comment from Ship gets the card a message from Peek would:
 *
 * - **At send**, the one file the text names gets `["embed", V, "detailed"]`
 *   by `defaultCardOf`: a Folder, a person, a message and the file the
 *   conversation is on do not count, a link on words counts by its target, and
 *   a plain web link counts for nothing.
 * - **On an edit**, only a file the edit names first gets its default, and the
 *   edit then carries the whole folded set, since a set replaces. A card
 *   removed with ✕ stays removed while its link stays.
 * - **✕ on a sent card** is the folded set with that card `none`, every other kept.
 *
 * Ship's own box shows no card while you write (Decided 19 Oct): that comes with
 * the shared comment box, so a send here always takes the default.
 */
import { defaultCardOf, toRenderTree, valuesIn, withCard, type Embed, type LinkResolver, type PartPointer } from '@estiva-app/protocol'

export interface CardContext {
  /** What an app link names (§7.7), as answered so far. */
  resolveLink: LinkResolver
  /** The message's `part` pointers: a part counts as its file and draws instead of a card. */
  parts?: readonly PartPointer[]
  /** The file whose conversation this is: it gets no card there. */
  here?: string
}

/** Every address and event id a message's text names. */
function namedIn(body: string, resolveLink: LinkResolver): string[] {
  return body ? valuesIn(toRenderTree(body, 'marker'), resolveLink) : []
}

/** The `embed` set a new message sends: its one file's default card, or none. `none` is never written. */
export function embedsToSend(body: string, context: CardContext): Embed[] {
  const card = defaultCardOf(namedIn(body, context.resolveLink), context.parts, { here: context.here })
  return card ? [{ value: card, layout: 'detailed' }] : []
}

/**
 * The `embed` set an edit sends, or undefined to leave the message's as it
 * was: only an edit that names a file first adds its default, carrying the
 * whole folded set with it.
 */
export function embedsToEdit(before: string, after: string, folded: readonly Embed[] | undefined, context: CardContext): Embed[] | undefined {
  const previous = [...new Set([...namedIn(before, context.resolveLink), ...(context.parts ?? []).map((part) => part.address)])]
  const card = defaultCardOf(namedIn(after, context.resolveLink), context.parts, { here: context.here, previous })
  return card ? withCard(folded ?? [], card, 'detailed') : undefined
}

/** ✕ on a sent message's card: the folded set, with that card `none` and every other kept. */
export function withoutCard(folded: readonly Embed[] | undefined, value: string): Embed[] {
  return withCard(folded ?? [], value, 'none')
}
