import { referenceOfValue } from '@/components/conversations/shared'
import { LinkCard, LinkRow } from '@estiva-app/ui'
import { pickWidget } from '@/api/foreign'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { linkStateOf } from '@/lib/linked'
import { conversationHref, LinkClicks } from './MessageLinks'

/**
 * A file Ship lists by itself — a Folder's own projects and issues, the file a
 * hand-off page names — as the kit's row or card, the same widgets a message
 * draws (Katerina, 30 Oct, widget review 52): its key and title, its kind's
 * tile and word, its state, its comments when the caller read them, and "not
 * available" in the row's or the card's place, with the way to open it where
 * it lives, for a file this reader may not see.
 *
 * **The owner defines the projection, the consumer decides how it looks**
 * (RFC 0.4 §13.1): nothing here knows what Peek is. The manifest's widget hint
 * picks row or card; a message, and anything this consumer does not implement,
 * draws the row, which the kit draws as a person's words for a message.
 *
 * Its values are words: a listing is not where a file is changed.
 */
const IMPLEMENTED = ['message', 'card', 'row'] as const

export interface ForeignObjectProps {
  object: ForeignObjectData
  /**
   * How many conversations are on it, when the caller read that: drawn as the
   * kit's count, opening them. A Folder listing does not read it (one more
   * query per listing); a Related section does.
   */
  conversations?: number
}

export function ForeignObject({ object, conversations }: ForeignObjectProps) {
  const widget = pickWidget(object.widget, IMPLEMENTED, 'card') === 'card' ? 'card' : 'row'
  const conversation = conversations !== undefined && conversations > 0 && !object.unreachable ? { count: conversations, href: conversationHref(object) } : undefined
  // Its reference names it by kind before anything is read: the words "not available" falls back on.
  const link = linkStateOf((object.address && referenceOfValue(object.address)) || object.ref, object, conversation ? { conversation } : {})
  return (
    <LinkClicks block>
      <div data-foreign-object={object.ref} data-widget={widget} data-state={object.unreachable ? 'unreachable' : undefined}>
        {widget === 'card' ? <LinkCard link={link} /> : <LinkRow link={link} />}
      </div>
    </LinkClicks>
  )
}
