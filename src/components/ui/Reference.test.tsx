/**
 * A person named in text — RIC-10's person half. A file or a message named in
 * text is the kit's chip since the widget review (Katerina, 30 Oct, items 16
 * and 52): `MessageChip`, tested where it draws (`ThreadList.kit.test.tsx`,
 * `ConversationBox.cards.test.tsx`).
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { encodeNpub } from '@estiva-app/protocol'
import { Reference } from './Reference'

const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const STRANGER = 'cd'.repeat(32)
const NPUB = `nostr:${encodeNpub(ADA)}`
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : `${pubkey.slice(0, 8)}…`)

describe('Reference, a person', () => {
  it('draws a person from the directory', () => {
    const c = render(<Reference uri={NPUB} nameOf={nameOf} />).container
    expect(c.querySelector('[data-reference="person"]')).not.toBeNull()
    expect(c.textContent).toBe('@Ada Lovelace')
  })

  it('is a label: Ship has no page for a person', () => {
    expect(render(<Reference uri={NPUB} nameOf={nameOf} />).container.querySelector('a')).toBeNull()
  })

  it('never renders blank, and never the whole key, for somebody the directory cannot name — §13.1', () => {
    const c = render(<Reference uri={`nostr:${encodeNpub(STRANGER)}`} nameOf={nameOf} />).container
    expect(c.textContent).not.toBe('')
    expect(c.textContent).not.toContain(STRANGER)
    expect(c.querySelector('[data-resolved="false"]')).not.toBeNull()
  })
})
