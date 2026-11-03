/**
 * Where a chip leads — RIC-16.
 *
 * One of Ship's own objects leads to its page, in the grammar the issue list
 * already uses, so a chip and a row agree about a URL. Anything else leads to
 * the `openUrl` its manifest gave, or nowhere.
 */
import { describe, expect, it } from 'vitest'
import type { ForeignObject, TopicsRead } from '@estiva-app/interop'
import { href } from '@/router'
import { knowSpaces } from './topicLinks'
import { writtenLinkOf, referenceLink } from './referenceLink'

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

  it("another app's object leads to the URL its manifest gave — a Peek Folder opens in Peek", () => {
    const link = referenceLink(object({ kind: 39000, openUrl: 'https://peek.estiva.app/o/naddr1topic' }))
    expect(link).toEqual({ place: 'app', href: 'https://peek.estiva.app/o/naddr1topic' })
  })

  const TOPIC = `30840:${AUTHOR}:${D}`
  const topic = object({ kind: 30840, address: TOPIC, openUrl: 'https://peek.estiva.app/o/naddr1topic', slots: { title: { value: 'Widgets' } } })

  it('a topic leads to its page here, a space to Peek once the topics read says it is one (SHIPS-4)', () => {
    expect(referenceLink(topic)).toEqual({ place: 'here', href: `/topic/widgets-${D}` })
    knowSpaces({ me: AUTHOR, membership: {}, topics: [{ address: TOPIC, space: true }] } as unknown as TopicsRead)
    expect(referenceLink(topic)).toEqual({ place: 'app', href: 'https://peek.estiva.app/o/naddr1topic' })
    knowSpaces({ me: AUTHOR, membership: {}, topics: [] } as unknown as TopicsRead)
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

describe('writtenLinkOf', () => {
  const SHIP = 'https://ship.estiva.app'
  const LEAF_PAGE = 'https://leaf.estiva.app/p/x'

  it('a block link on the origin its file opens on leads to that block', () => {
    expect(writtenLinkOf('https://leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toEqual({ place: 'app', href: 'https://leaf.estiva.app/p/x#block-1' })
  })

  /*
    WBM-11's security review: a chip draws one file and must never open another
    site. A host that merely ends in the file's host is another site, so a
    block chip would open a lookalike; the origin is compared exactly.
  */
  it('a block link on a lookalike host that ends in the file’s host leads nowhere, https or http', () => {
    expect(writtenLinkOf('https://evil-leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toBeUndefined()
    expect(writtenLinkOf('http://evil-leaf.estiva.app/p/x#block-1', LEAF_PAGE, SHIP)).toBeUndefined()
  })

  it('a block link on a host that starts with the file’s host, hides it before an @, adds a port or a subdomain leads nowhere', () => {
    for (const url of [
      'https://leaf.estiva.app.evil.com/p/x#block-1',
      'https://leaf.estiva.app@evil.com/p/x#block-1',
      'https://leaf.estiva.app:8443/p/x#block-1',
      'https://x.leaf.estiva.app/p/x#block-1',
    ]) {
      expect(writtenLinkOf(url, LEAF_PAGE, SHIP), url).toBeUndefined()
    }
  })

  const DECLARED = new Set(['https://leaf.estiva.app', 'https://peek.estiva.app', SHIP])
  const ISSUE_ROUTE = '/issue/plan-x'

  // Record a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind (SHIPS-4); LTX-6 opened them there.
  it('Ship’s own file written on another declared host opens Ship’s page, at the block it names', () => {
    expect(writtenLinkOf('https://leaf.estiva.app/issue/plan-x', ISSUE_ROUTE, SHIP, DECLARED)).toBeUndefined()
    expect(writtenLinkOf('https://peek.estiva.app/issue/plan-x#block-1', ISSUE_ROUTE, SHIP, DECLARED)).toEqual({ place: 'here', href: '/issue/plan-x#block-1' })
  })

  it('a link to one message in Ship’s file opens as written, in the app that shows it', () => {
    expect(writtenLinkOf('https://peek.estiva.app/issue/plan-x?thread=abc', ISSUE_ROUTE, SHIP, DECLARED)).toEqual({ place: 'app', href: 'https://peek.estiva.app/issue/plan-x?thread=abc' })
  })

  const TOPIC_ROUTE = `/topic/widgets-${D}`
  const PEEK_TOPIC = `https://peek.estiva.app/topic/widgets-${D}`

  it('a topic written with Peek’s address opens its page here; one message in it, or a block, opens Peek as written', () => {
    expect(writtenLinkOf(PEEK_TOPIC, TOPIC_ROUTE, SHIP, DECLARED)).toBeUndefined()
    expect(writtenLinkOf(`${PEEK_TOPIC}?thread=abc`, TOPIC_ROUTE, SHIP, DECLARED)).toEqual({ place: 'app', href: `${PEEK_TOPIC}?thread=abc` })
    expect(writtenLinkOf(`${PEEK_TOPIC}#block-1`, TOPIC_ROUTE, SHIP, DECLARED)).toEqual({ place: 'app', href: `${PEEK_TOPIC}#block-1` })
  })

  it('a link to one message in a topic written on Ship’s host keeps its thread, for the hand-off to Peek', () => {
    expect(writtenLinkOf(`${SHIP}${TOPIC_ROUTE}?thread=abc`, TOPIC_ROUTE, SHIP, DECLARED)).toEqual({ place: 'here', href: `${TOPIC_ROUTE}?thread=abc` })
  })

  // SHIPS-4 security review: a file's `d` with dot segments must never turn its block route into another host.
  it('a block of Ship’s own file whose route normalises to two slashes never becomes a route to another host', () => {
    expect(writtenLinkOf('https://peek.estiva.app/issue/plan-x#block-1', '/issue/x/../..//evil.example/y', SHIP, DECLARED)).toBeUndefined()
  })

  it('a space, which opens in Peek, opens Peek as written', () => {
    expect(writtenLinkOf(PEEK_TOPIC, 'https://peek.estiva.app/o/naddr1space', SHIP, DECLARED)).toEqual({ place: 'app', href: PEEK_TOPIC })
  })

  it('another app’s file written on Ship’s host opens here, through the router', () => {
    expect(writtenLinkOf('https://ship.estiva.app/document/plan-x', LEAF_PAGE, SHIP, DECLARED)).toEqual({ place: 'here', href: '/document/plan-x' })
  })

  it('Ship’s own file written on Ship’s host keeps its own route unless it names a block', () => {
    expect(writtenLinkOf('https://ship.estiva.app/issue/plan-x', ISSUE_ROUTE, SHIP, DECLARED)).toBeUndefined()
    expect(writtenLinkOf('https://ship.estiva.app/issue/plan-x#block-1', ISSUE_ROUTE, SHIP, DECLARED)).toEqual({ place: 'here', href: '/issue/plan-x#block-1' })
  })

  it('a lookalike of a declared host is still another site', () => {
    expect(writtenLinkOf('https://leaf.estiva.app.evil.com/issue/plan-x', ISSUE_ROUTE, SHIP, DECLARED)).toBeUndefined()
    expect(writtenLinkOf('http://leaf.estiva.app/issue/plan-x', ISSUE_ROUTE, SHIP, DECLARED)).toBeUndefined()
  })

  // LTX-6 security re-review: a route starting `//` is another host to the router and the browser.
  it('a path on Ship’s host that starts with two slashes (or a slash and a backslash) never becomes a route to another host', () => {
    for (const url of ['https://ship.estiva.app//document/plan-x', 'https://ship.estiva.app/\\document/plan-x', 'https://ship.estiva.app//evil.example/issue/plan-x#block-1']) {
      expect(writtenLinkOf(url, LEAF_PAGE, SHIP, DECLARED), url).toBeUndefined()
    }
  })
})
