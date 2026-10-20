/**
 * A link to one block in a description is its file's chip, and the chip opens
 * that block (WBM-11; Miky, 19 Oct: "the file's chip everywhere, messages and
 * descriptions alike, and clicking it opens the block").
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { addrToNaddr } from '@estiva-app/protocol'
import { ShipRichText } from './ShipRichText'

const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
// Another app's page, so its chip opens in that app (Ship's own issue opens as a route, on Ship's origin).
const ADDRESS = `30842:${'f'.repeat(64)}:${D}`
const FILE_LINK = `https://leaf.estiva.app/page/plan-the-launch-${D}`
const OLD_LINK = `https://leaf.estiva.app/#/page/${D}`
const REFERENCE =`nostr:${addrToNaddr(ADDRESS, [])}`
const object = { ref: ADDRESS, address: ADDRESS, kind: 30842, appName: 'Leaf', noun: 'page', openUrl: `https://leaf.estiva.app/o/${ADDRESS}`, slots: { title: { value: 'Plan the launch' } } } as never

const chipOf = (value: string) => {
  const { container } = render(<ShipRichText value={value} format="marker" resolved={{ [REFERENCE]: object }} resolveLink={(url) => (url.startsWith(FILE_LINK) || url === OLD_LINK ? ADDRESS : undefined)} />)
  return container.querySelector('[data-reference="object"]')
}
const hrefOf = (chip: Element | null) => chip?.closest('a')?.getAttribute('href') ?? chip?.getAttribute('href')

describe('a link to one block in a description', () => {
  it('is its file’s chip, opening the block', () => {
    const chip = chipOf(`see ${FILE_LINK}#block-p1 here`)
    expect(chip?.textContent).toContain('Plan the launch')
    expect(hrefOf(chip)).toBe(`${FILE_LINK}#block-p1`)
  })

  // A click opens the address as written, in the app it names (LTX-6), block or not.
  it('a link to the whole file opens as written', () => {
    expect(hrefOf(chipOf(`see ${FILE_LINK} here`))).toBe(FILE_LINK)
  })

  it('an old `#/page/…` link opens as written, where its app still serves it', () => {
    expect(hrefOf(chipOf(`see ${OLD_LINK} here`))).toBe(OLD_LINK)
  })
})
