/**
 * A link to one block in a description is its file's chip, and the chip opens
 * that block (WBM-11; Miky, 19 Oct: "the file's chip everywhere, messages and
 * descriptions alike, and clicking it opens the block"). Moved from
 * `ShipRichText.blockLinks.test.tsx`: the description's reading surface draws
 * with `DescriptionReading` now, as its editor does (item 43).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { addrToNaddr } from '@estiva-app/protocol'
// Deleted or not, a link written as a URL stays its URL: the deletion read is `absence.test`'s.
vi.mock('@/api/absence', () => ({ useDeleted: () => false }))

import { DescriptionReading } from './descriptionLinks'

const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
// Another app's page, so its chip opens in that app (Ship's own issue opens as a route, on Ship's origin).
const ADDRESS = `30842:${'f'.repeat(64)}:${D}`
const FILE_LINK = `https://leaf.estiva.app/page/plan-the-launch-${D}`
const OLD_LINK = `https://leaf.estiva.app/#/page/${D}`
const REFERENCE = `nostr:${addrToNaddr(ADDRESS, [])}`
const object = { ref: ADDRESS, address: ADDRESS, kind: 30842, appName: 'Leaf', noun: 'page', openUrl: `https://leaf.estiva.app/o/${ADDRESS}`, slots: { title: { value: 'Plan the launch' } }, meta: [], actions: [], comments: [] } as never

const chipOf = (value: string) => {
  const { container } = render(<DescriptionReading value={value} format="marker" resolved={{ [REFERENCE]: object }} resolveLink={(url) => (url.startsWith(FILE_LINK) || url === OLD_LINK ? ADDRESS : undefined)} readOnly />)
  return container.querySelector('p a')
}

describe('a link to one block in a description', () => {
  it('is its file’s chip, opening the block', () => {
    const chip = chipOf(`see ${FILE_LINK}#block-p1 here`)
    expect(chip?.textContent).toContain('Plan the launch')
    expect(chip?.getAttribute('href')).toBe(`${FILE_LINK}#block-p1`)
  })

  // A click opens the address as written, in the app it names (LTX-6), block or not.
  it('a link to the whole file opens as written', () => {
    expect(chipOf(`see ${FILE_LINK} here`)?.getAttribute('href')).toBe(FILE_LINK)
  })

  it('an old `#/page/…` link opens as written, where its app still serves it', () => {
    expect(chipOf(`see ${OLD_LINK} here`)?.getAttribute('href')).toBe(OLD_LINK)
  })

  // SPEC §13.1, C21 (widget review 58): "not available" is only for a `nostr:` reference with no URL to fall back on.
  it('stays the URL as written, a plain link, when its file cannot be shown', () => {
    const { container } = render(<DescriptionReading value={`see ${FILE_LINK} here`} format="marker" resolved={{ [REFERENCE]: null }} resolveLink={(url) => (url.startsWith(FILE_LINK) ? ADDRESS : undefined)} readOnly />)
    const link = container.querySelector('p a')
    expect(link?.getAttribute('href')).toBe(FILE_LINK)
    expect(link?.textContent).toContain(FILE_LINK)
    expect(container.textContent).not.toContain('not available')
  })
})
