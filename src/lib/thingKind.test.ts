import { describe, expect, it } from 'vitest'
import { encodeNaddr, encodeNpub } from '@estiva-app/protocol'
import { messageReference } from '@estiva-app/conversation'
import { thingKindOfUri } from './thingKind'

const KEY = 'c'.repeat(64)
const naddr = (kind: number) => `nostr:${encodeNaddr({ kind, pubkey: KEY, identifier: 'd', relays: [] })}`

describe('thingKindOfUri — the icon a [ row and its chip wear (Katerina, 8 October)', () => {
  it('names each kind of thing by its pointer, as Peek does', () => {
    expect(thingKindOfUri(naddr(30850))).toBe('project')
    expect(thingKindOfUri(naddr(30851))).toBe('issue')
    expect(thingKindOfUri(naddr(30840))).toBe('topic')
    expect(thingKindOfUri(naddr(39000))).toBe('topic')
    expect(thingKindOfUri(naddr(31337))).toBe('file')
    expect(thingKindOfUri(messageReference('d'.repeat(64), 9))).toBe('message')
  })

  it('leaves a person, a broken pointer and nothing to the caller’s own icon', () => {
    expect(thingKindOfUri(`nostr:${encodeNpub(KEY)}`)).toBeUndefined()
    expect(thingKindOfUri('nostr:naddr1broken')).toBeUndefined()
    expect(thingKindOfUri(null)).toBeUndefined()
  })
})
