/**
 * A body written in Peek, rendered in Ship — RIC-2's second-app clause.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { encodeNpub } from '@estiva-app/protocol'
import { ShipRichText } from './ShipRichText'

const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : `${pubkey.slice(0, 8)}…`)

const show = (value: string) =>
  render(<ShipRichText value={value} format="marker" nameOf={nameOf} />).container

describe('a mention inside a description', () => {
  it('resolves a key Peek wrote', () => {
    const c = show(`ask nostr:${encodeNpub(ADA)} about it`)
    expect(c.textContent).toContain('@Ada Lovelace')
    expect(c.textContent).not.toContain('npub1')
  })

  it('cannot resolve the old display-name form, which is the point', () => {
    // Ship holds none of Peek's directory, so `@Ada Lovelace` is prose here and
    // always was. This is the defect RIC-2 exists to fix, asserted rather than
    // described — if Ship ever starts resolving names, something has grown a
    // shared directory and this test should be the thing that objects.
    const c = show('ask @Ada Lovelace about it')
    expect(c.querySelector('[data-mention]')).toBeNull()
    expect(c.textContent).toBe('ask @Ada Lovelace about it')
  })

  it('keeps a quoted key literal', () => {
    const c = show(`type \`nostr:${encodeNpub(ADA)}\` exactly`)
    expect(c.querySelector('[data-mention]')).toBeNull()
    expect(c.querySelector('code')?.textContent).toContain('npub1')
  })

  it('resolves one inside a list item', () => {
    const c = show(`- ask nostr:${encodeNpub(ADA)}`)
    expect(c.querySelector('li [data-mention]')).not.toBeNull()
  })
})
