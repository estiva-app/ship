/**
 * A mention written by another app, resolved here — RIC-2's decisive clause.
 *
 * The ticket's done-when asks that "a mention resolves in a second app with no
 * shared directory". Ship is that second app: it did not write these bodies,
 * holds none of Peek's `PEOPLE`, and has never been able to render a
 * display-name mention as anything but prose.
 *
 * What it does hold is a directory keyed by public key, because Ship is
 * Nostr-native — so the same key Peek wrote is the one Ship looks up.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { encodeNpub } from '@estiva-app/protocol'
import { MentionChip } from './MentionChip'

const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const STRANGER = 'cd'.repeat(32)
const short = (pubkey: string) => `${pubkey.slice(0, 8)}…`

/** Ship's own directory shape: a name when it knows one, a short key otherwise. */
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : short(pubkey))

describe('MentionChip', () => {
  it('names somebody the workspace knows', () => {
    const c = render(<MentionChip uri={`nostr:${encodeNpub(ADA)}`} nameOf={nameOf} />).container
    expect(c.textContent).toBe('@Ada Lovelace')
    expect(c.querySelector('[data-resolved="true"]')).not.toBeNull()
  })

  it('still draws a mention for somebody it does not', () => {
    // §13.1: never blank. Saying *who* without saying what they are called is
    // the honest answer, and one the display-name form could not give at all.
    const c = render(<MentionChip uri={`nostr:${encodeNpub(STRANGER)}`} nameOf={nameOf} />).container
    expect(c.textContent).not.toBe('')
    expect(c.querySelector('[data-resolved="false"]')).not.toBeNull()
  })

  it('carries the key, so meaning does not depend on the label', () => {
    const c = render(<MentionChip uri={`nostr:${encodeNpub(ADA)}`} nameOf={nameOf} />).container
    expect(c.querySelector(`[data-mention="${ADA}"]`)).not.toBeNull()
  })

  it('works with no directory at all', () => {
    // A page that has none must not crash, and must not render blank.
    const c = render(<MentionChip uri={`nostr:${encodeNpub(ADA)}`} />).container
    expect(c.textContent).toMatch(/^npub1.*…$/)
  })

  it('leaves a reference that is not a person alone', () => {
    const c = render(<MentionChip uri="nostr:naddr1notreal" nameOf={nameOf} />).container
    expect(c.textContent).toBe('nostr:naddr1notreal')
  })
})
