import { describe, expect, it } from 'vitest'
import { isSiblingHost } from './topicLinks'

/*
  SHIPS-4 security review: a space's page sends the reader on to Peek without a
  click, and Peek's link comes from the newest manifest any member may publish.
  Only a host beside Ship's own is ever navigated to that way.
*/
describe('where a space may send the reader without a click', () => {
  it('goes on to Peek beside Ship', () => {
    expect(isSiblingHost('https://peek.estiva.app/topic/bugs-x', 'ship.estiva.app')).toBe(true)
  })

  it('never to a host a planted manifest names, a lookalike, a deeper subdomain or Ship itself', () => {
    for (const url of [
      'https://evil.example/topic/bugs-x',
      'https://peek.estiva.app.evil.example/topic/bugs-x',
      'https://evilestiva.app/topic/bugs-x',
      'https://x.peek.estiva.app/topic/bugs-x',
      'https://ship.estiva.app/topic/bugs-x',
    ]) {
      expect(isSiblingHost(url, 'ship.estiva.app'), url).toBe(false)
    }
  })

  it('never on a host with no parent domain of its own, as on a laptop', () => {
    expect(isSiblingHost('https://peek.localhost/topic/bugs-x', 'localhost')).toBe(false)
  })
})
