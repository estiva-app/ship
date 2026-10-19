/**
 * Where a chip leads — RIC-16.
 *
 * One of Ship's own objects leads to its page, in the grammar the issue list
 * already uses, so a chip and a row agree about a URL. Anything else leads to
 * the `openUrl` its manifest gave, or nowhere.
 */
import { describe, expect, it } from 'vitest'
import type { ForeignObject } from '@estiva-app/interop'
import { href } from '@/router'
import { blockLinkOf, referenceLink } from './referenceLink'

const AUTHOR = 'ab'.repeat(32)
const D = '0212db6d-bcbf-40d0-890e-f4f056db2f5d'

const object = (overrides: Partial<ForeignObject>): ForeignObject =>
  ({ ref: 'x', eventId: 'e'.repeat(64), kind: 0, widget: 'card', slots: {}, ...overrides }) as ForeignObject

describe('referenceLink', () => {
  it('an issue leads to its page here, slug and all — the same path the issue list builds', () => {
    const link = referenceLink(object({ kind: 30851, address: `30851:${AUTHOR}:${D}`, slots: { title: { value: 'Ship it' } } }))
    expect(link).toEqual({ place: 'here', href: href({ name: 'issue', d: D, slug: 'Ship it' }) })
    expect(link?.href).toBe(`/issue/ship-it-${D}`)
  })

  it('a project leads to its page here', () => {
    const link = referenceLink(object({ kind: 30850, address: `30850:${AUTHOR}:${D}`, slots: { title: { value: 'Rich text' } } }))
    expect(link).toEqual({ place: 'here', href: `/project/rich-text-${D}` })
  })

  it('a title that is a person is no slug', () => {
    const link = referenceLink(object({ kind: 30851, address: `30851:${AUTHOR}:${D}`, slots: { title: { value: AUTHOR, isPubkey: true } } }))
    expect(link?.href).toBe(`/issue/${D}`)
  })

  it("another app's object leads to the URL its manifest gave — a Peek topic opens in Peek", () => {
    const link = referenceLink(object({ kind: 39000, openUrl: 'https://peek.estiva.app/o/naddr1topic' }))
    expect(link).toEqual({ place: 'app', href: 'https://peek.estiva.app/o/naddr1topic' })
  })

  it('a message — no address at all — leads to its openUrl too', () => {
    const link = referenceLink(object({ kind: 9, openUrl: 'https://peek.estiva.app/o/nevent1msg' }))
    expect(link).toEqual({ place: 'app', href: 'https://peek.estiva.app/o/nevent1msg' })
  })

  it('leads nowhere for nothing resolved, an object the reader may not see, or an app with no web template', () => {
    expect(referenceLink(undefined)).toBeNull()
    expect(referenceLink(null)).toBeNull()
    expect(referenceLink(object({ kind: 30851, address: `30851:${AUTHOR}:${D}`, unreachable: true }))).toBeNull()
    expect(referenceLink(object({ kind: 30852 }))).toBeNull()
  })

  it("leads nowhere when another app's manifest gave a link that is not https", () => {
    expect(referenceLink(object({ kind: 9, openUrl: 'search-ms:query=nevent1msg' }))).toBeNull()
    expect(referenceLink(object({ kind: 39000, openUrl: 'http://peek.estiva.app/o/naddr1topic' }))).toBeNull()
  })
})

describe('blockLinkOf', () => {
  const SHIP = 'https://ship.estiva.app'
  const LEAF_PAGE = 'https://leaf.estiva.app/p/x'

  it('a block link on the origin its file opens on leads to that block', () => {
    expect(blockLinkOf('https://leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toEqual({ place: 'app', href: 'https://leaf.estiva.app/p/x#block-1' })
  })

  /*
    WBM-11's security review: a chip draws one file and must never open another
    site. A host that merely ends in the file's host is another site, so a
    block chip would open a lookalike; the origin is compared exactly.
  */
  it('a block link on a lookalike host that ends in the file’s host leads nowhere, https or http', () => {
    expect(blockLinkOf('https://evil-leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toBeUndefined()
    expect(blockLinkOf('http://evil-leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toBeUndefined()
  })
})
