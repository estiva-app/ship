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
const ADDRESS = `30851:${'f'.repeat(64)}:${D}`
const FILE_LINK = `https://ship.estiva.app/issue/plan-the-launch-${D}`
const REFERENCE = `nostr:${addrToNaddr(ADDRESS, [])}`
const object = { ref: ADDRESS, address: ADDRESS, kind: 30851, appName: 'Ship', noun: 'issue', openUrl: `https://ship.estiva.app/o/${ADDRESS}`, slots: { title: { value: 'Plan the launch' } } } as never

const chipOf = (value: string) => {
  const { container } = render(<ShipRichText value={value} format="marker" resolved={{ [REFERENCE]: object }} resolveLink={(url) => (url.startsWith(FILE_LINK) ? ADDRESS : undefined)} />)
  return container.querySelector('[data-reference="object"]')
}
const hrefOf = (chip: Element | null) => chip?.closest('a')?.getAttribute('href') ?? chip?.getAttribute('href')

describe('a link to one block in a description', () => {
  it('is its file’s chip, opening the block', () => {
    const chip = chipOf(`see ${FILE_LINK}#block-p1 here`)
    expect(chip?.textContent).toContain('Plan the launch')
    expect(hrefOf(chip)).toBe(`${FILE_LINK}#block-p1`)
  })

  it('a link to the whole file opens where the file opens, as before', () => {
    const chip = chipOf(`see ${FILE_LINK} here`)
    expect(hrefOf(chip)).not.toContain('#block-')
  })
})
