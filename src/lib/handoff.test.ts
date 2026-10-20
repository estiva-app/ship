import { describe, expect, it } from 'vitest'
import { lookupFor } from './handoff'

const D = '2a48e88d-d999-4ebf-a1de-1668880a8cdc'
const ID = 'a'.repeat(64)

/** The `k`, `web` and `urls` tags of the two manifests on production, read 2026-10-01; `urls` count only on the `web` origin. */
const SHIP = {
  tags: [
    ['k', '30850'],
    ['k', '30851'],
    ['web', 'https://ship.estiva.app/o/<bech32>', 'naddr'],
    ['urls', 'https://ship.estiva.app/project/<slug>-<d>', '30850'],
    ['urls', 'https://ship.estiva.app/issue/<slug>-<d>', '30851'],
    ['urls', 'https://ship.estiva.app/#/project/<d>', '30850'],
    ['urls', 'https://ship.estiva.app/#/issue/<d>', '30851'],
  ],
}
const PEEK = {
  tags: [
    ['k', '39000'],
    ['k', '9'],
    ['web', 'https://peek.estiva.app/o/<bech32>', 'naddr'],
    ['urls', 'https://peek.estiva.app/topic/<slug>-<d>', '30840'],
    ['urls', 'https://peek.estiva.app/topic/<slug>-<d>?thread=<id>', '1111'],
    ['urls', 'https://peek.estiva.app/topic-old/<slug>-<d>', '39000'],
    ['urls', 'https://peek.estiva.app/message/<id>', '9'],
  ],
}
const MANIFESTS = [SHIP, PEEK]

describe('lookupFor — what a path on Ship names (RFC 0.5 §7.7)', () => {
  it('reads a Peek topic link off Peek’s manifest, whatever host it arrived on', () => {
    expect(lookupFor('topic', `who-will-extract-${D}`, MANIFESTS)).toEqual({ by: 'd', identifier: D, kinds: [30840] })
  })

  it('needs no slug, as §7.2 promises', () => {
    expect(lookupFor('topic', D, MANIFESTS)).toEqual({ by: 'd', identifier: D, kinds: [30840] })
  })

  it('reads an event shape by id', () => {
    expect(lookupFor('message', ID, MANIFESTS)).toEqual({ by: 'id', identifier: ID, kinds: [] })
  })

  it('learns the word from the manifests, not from Ship', () => {
    // The same path with no manifest declaring `topic` is not a topic link.
    expect(lookupFor('topic', D, [SHIP])?.kinds).not.toContain(30840)
  })

  it('looks a word nobody declares up under every declared `<d>` kind, never bare (rule 4)', () => {
    const lookup = lookupFor('note', `x-${D}`, MANIFESTS)
    expect(lookup?.by).toBe('d')
    expect(lookup?.identifier).toBe(D)
    expect(lookup?.kinds.sort()).toEqual([30840, 30850, 30851, 39000])
  })

  it('does not count a thread shape’s kind: its path `<d>` is the topic’s', () => {
    expect(lookupFor('note', D, MANIFESTS)?.kinds).not.toContain(1111)
  })

  it('names nothing when the ref carries no identity', () => {
    expect(lookupFor('topic', 'no-identity-here', MANIFESTS)).toBe(null)
  })

  it('names nothing when no manifest is on the relay', () => {
    expect(lookupFor('note', D, [])).toBe(null)
  })
})
