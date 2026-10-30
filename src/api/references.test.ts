// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { addrToNaddr, encodeNpub } from '@estiva-app/protocol'
import type { ThreadData } from '@/components/ConversationThread'
import { REFERENCE_COPY, referenceCaptions, referenceSections, type MessageScope } from './references'
import { short } from './people'

const QA2 = '3bb30d683788016b85c83604dd5660e4e172e95d46d4e3ebab623ff5847b1f71'
const STRANGER = 'd'.repeat(64)
const ISSUE = `nostr:${addrToNaddr(`30851:${'b'.repeat(64)}:widgets`)}`
const nameOf = (pubkey: string) => (pubkey === QA2 ? 'QA-2' : short(pubkey))

const thread = (id: string, body: string): ThreadData => ({
  id,
  root: { id, kind: 1111, author: { name: 'Claude' }, at: 1, body } as ThreadData['root'],
  replies: [],
})

/** The Messages section, wherever it is drawn. */
const messagesOf = (scope: MessageScope, query = '') => referenceSections(scope, query, nameOf).find((section) => section.label === REFERENCE_COPY.messages)!

describe("`[`'s row for a comment reads its opening words as Peek and Leaf do (PEEKM-6)", () => {
  const body = `Zebra probe: **bold words**, read [the widgets guide](https://example.com/guide) with nostr:${encodeNpub(QA2)} about ${ISSUE} then \`code\``
  const scope = { here: [thread('e'.repeat(64), body)], parent: [] }

  it('a link as its words, a person by name, and an issue as "Issue", never dropped', () => {
    expect(messagesOf(scope).items[0].snippet).toBe('Zebra probe: bold words, read the widgets guide with @QA-2 about Issue then code')
  })

  it('a person Ship cannot name as their shortened npub, not "someone" or Ship\'s own short key', () => {
    const npub = encodeNpub(STRANGER)
    expect(messagesOf({ here: [thread('f'.repeat(64), `ask nostr:${npub}`)], parent: [] }).items[0].snippet).toBe(`ask @${npub.slice(0, 12)}…`)
  })

  it("the chip of a referenced comment captions it the same way", () => {
    const uri = messagesOf(scope).items[0].uri
    expect(referenceCaptions(scope, nameOf)(uri)?.snippet).toBe('Zebra probe: bold words, read the widgets guide with @QA-2 about Issue then code')
  })
})

// Katerina, 30 Oct (widget review 19): Files first, and a message is found by its own words, not a link's raw text.
describe("`[`'s sections", () => {
  it('lists Files above Messages, as every app draws them', () => {
    expect(referenceSections({ here: [thread('e'.repeat(64), 'hello')], parent: [] }, '', nameOf).map((section) => section.label)).toEqual([REFERENCE_COPY.files, REFERENCE_COPY.messages])
  })

  it('finds a message by its words, not by the raw text of a link in it', () => {
    const scope = { here: [thread('e'.repeat(64), 'see https://ship.estiva.app/issue/zebra-plan-0212db6d about the launch')], parent: [] }
    expect(messagesOf(scope, 'zebra').items).toHaveLength(0)
    expect(messagesOf(scope, 'launch').items).toHaveLength(1)
  })
})
