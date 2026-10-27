/**
 * Whom Ship's `@` offers — the shared rule (`mentionablePeople`, PEEKM-6): the
 * named people it is given, by name, and never the person typing. Offering you
 * yourself is a chip that notifies nobody and reads as a bug.
 */
import { describe, expect, it } from 'vitest'
import { mentionPeople } from './mentionables'

const ME = 'e'.repeat(64)
const ALICE = 'a'.repeat(64)
const BORIS = 'b'.repeat(64)
const NAMES: Record<string, string> = { [ME]: 'Me Myself', [ALICE]: 'Alice', [BORIS]: 'Boris' }

const directory = {
  nameOf: (pubkey: string) => NAMES[pubkey] ?? pubkey.slice(0, 8),
  personOf: (pubkey: string) => ({ name: NAMES[pubkey] ?? pubkey.slice(0, 8) }),
  profileOf: (pubkey: string) => (NAMES[pubkey] ? { pubkey, name: NAMES[pubkey], createdAt: 1 } : undefined),
}

const offered = (pubkeys: string[]) => mentionPeople(pubkeys, ME, directory).map((person) => person.name)

describe('whom @ offers in a Ship message box', () => {
  it('offers the other members and never the viewer, even when the viewer is on the list', () => {
    expect(offered([ME, ALICE])).toEqual(['Alice'])
  })

  it('offers the named members by name, leaving out a key with no profile', () => {
    expect(offered([BORIS, 'c'.repeat(64), ME, ALICE])).toEqual(['Alice', 'Boris'])
  })
})
