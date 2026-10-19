import { describe, expect, it } from 'vitest'
import { addrToNaddr } from '@estiva-app/protocol'
import { embedsToEdit, embedsToSend, withoutCard } from './messageCard'

const PK = 'ab'.repeat(32)
const HERE = `30851:${PK}:here`
const ISSUE = `30851:${PK}:one`
const OTHER = `30851:${PK}:two`
const FOLDER = `39000:${PK}:team`
const URL = 'https://ship.estiva.app/issue/one'
const ref = (address: string) => `nostr:${addrToNaddr(address)}`
// What Ship's link lookups answer: the one app URL here names ISSUE; anything else names nothing.
const context = { resolveLink: (url: string) => (url === URL ? ISSUE : undefined), here: HERE }

describe('the card a comment sends from Ship (SPEC §13.6.2)', () => {
  it('one file named gets its detailed card', () => {
    expect(embedsToSend(`see ${ref(ISSUE)}`, context)).toEqual([{ value: ISSUE, layout: 'detailed' }])
  })

  it('a link on words counts by its target, as a bare link does', () => {
    expect(embedsToSend(`the plan is [these words](${URL}) for now`, context)).toEqual([{ value: ISSUE, layout: 'detailed' }])
    expect(embedsToSend(`see ${URL}`, context)).toEqual([{ value: ISSUE, layout: 'detailed' }])
  })

  it('two files named get no card, on words or bare', () => {
    expect(embedsToSend(`[these words](${URL}) and ${ref(OTHER)}`, context)).toEqual([])
  })

  it('a plain web link does not take the card away', () => {
    expect(embedsToSend(`[these words](${URL}) and https://example.com/page`, context)).toEqual([{ value: ISSUE, layout: 'detailed' }])
  })

  it('the file the conversation is on and a Folder get no card', () => {
    expect(embedsToSend(`see ${ref(HERE)}`, context)).toEqual([])
    expect(embedsToSend(`see ${ref(FOLDER)}`, context)).toEqual([])
    expect(embedsToSend(`${ref(HERE)} and ${ref(ISSUE)}`, context)).toEqual([{ value: ISSUE, layout: 'detailed' }])
  })

  it('a block shown live draws instead of its file’s card', () => {
    expect(embedsToSend(`see ${ref(ISSUE)}`, { ...context, parts: [{ address: ISSUE, block: 'b1' }] })).toEqual([])
  })
})

describe('the card an edit sends', () => {
  it('an edit adding a first link adds its card, keeping every card the message had', () => {
    const folded = [{ value: OTHER, layout: 'none' as const }]
    expect(embedsToEdit('no link yet', `now ${ref(ISSUE)}`, folded, context)).toEqual([
      { value: OTHER, layout: 'none' },
      { value: ISSUE, layout: 'detailed' },
    ])
  })

  it('a card removed with ✕ stays removed while its link stays', () => {
    const removed = [{ value: ISSUE, layout: 'none' as const }]
    expect(embedsToEdit(`see ${ref(ISSUE)}`, `see ${ref(ISSUE)}, edited`, removed, context)).toBeUndefined()
    // Removed before sending: no tag at all, and the edit still adds none.
    expect(embedsToEdit(`see ${ref(ISSUE)}`, `see ${ref(ISSUE)}, edited`, undefined, context)).toBeUndefined()
  })

  it('an edit that changes only words leaves the cards as they were', () => {
    expect(embedsToEdit('hello', 'hello there', [{ value: ISSUE, layout: 'detailed' }], context)).toBeUndefined()
  })
})

describe('✕ on a sent card', () => {
  it('sets that card none and keeps every other, as a message written in Peek with two cards has', () => {
    const folded = [
      { value: ISSUE, layout: 'detailed' as const },
      { value: OTHER, layout: 'detailed' as const },
    ]
    expect(withoutCard(folded, ISSUE)).toEqual([
      { value: ISSUE, layout: 'none' },
      { value: OTHER, layout: 'detailed' },
    ])
  })
})
