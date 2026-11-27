/**
 * The link Ship hands out for a file (LIN-4): the shared writer's, with the
 * owner's word from the manifests, and never a word that is one of Ship's own
 * pages, which any member could publish a newer manifest to claim.
 */
import { describe, expect, test } from 'vitest'
import { fileUrlOf } from '@estiva-app/interop'
import { buildManifest } from '@/nostr/manifest'
import { addressParts, linkWordsOf } from './fileLinks'
import { topicInPeek } from './topicLinks'

const SHIP_KEY = 'a'.repeat(64)
const MEMBER = 'b'.repeat(64)
const D = '3f1c2a8e-5b7d-4c9e-8a1f-2b3c4d5e6f70'
const ISSUE = `30851:${SHIP_KEY}:${D}`
const PROJECT = `30850:${SHIP_KEY}:${D}`
const HOST = 'https://ship.estiva.app'

const ship = { ...buildManifest(SHIP_KEY, 1_700_000_000_000, HOST), id: '1' }

/** A newer manifest by another member claiming the issue with `word` for its path. */
function claimingIssueAs(word: string) {
  const event = buildManifest(MEMBER, 1_800_000_000_000, 'https://other.example')
  const tags = event.tags.filter((t) => t[0] !== 'urls').concat([['urls', `https://other.example/${word}/<slug>-<d>`, '30851']])
  return { ...event, tags, id: '2' }
}

describe("Ship's Copy link", () => {
  test("an issue's and a project's link is the short link Ship's manifest declares, on this host", () => {
    const words = linkWordsOf([ship])
    expect(fileUrlOf(ISSUE, words, HOST, 'Fix the login')).toBe(`${HOST}/issue/fix-the-login-${D}`)
    expect(fileUrlOf(PROJECT, words, HOST, 'Links')).toBe(`${HOST}/project/links-${D}`)
  })

  test('before the manifests are read, a link is the file\'s /o/ address, which every app opens', () => {
    expect(fileUrlOf(ISSUE, linkWordsOf([]), HOST)).toMatch(new RegExp(`^${HOST}/o/naddr1`))
  })

  test.each(['projects', 'project', 'topics', 'app'])(
    'a newer manifest giving issues the word "%s", one of Ship\'s own pages, does not move the link there',
    (word) => {
      const url = fileUrlOf(ISSUE, linkWordsOf([ship, claimingIssueAs(word)]), HOST)
      expect(url).not.toContain(`/${word}/`)
      expect(url).toMatch(new RegExp(`^${HOST}/o/naddr1`))
    },
  )

  test("a manifest giving issues the word of Ship's project page is not followed, even with Ship's own unread", () => {
    // Without Ship's manifest nothing else says `/project/` is a project's, but Ship's router reads it as one.
    const url = fileUrlOf(ISSUE, linkWordsOf([claimingIssueAs('project')]), HOST)
    expect(url).toMatch(new RegExp(`^${HOST}/o/naddr1`))
  })

  test('an id no file can have gets no link', () => {
    const words = linkWordsOf([ship])
    for (const d of ['PROJ-1', D.toUpperCase(), `note-${D}`, `a:${D}`]) expect(fileUrlOf(`30851:${SHIP_KEY}:${d}`, words, HOST)).toBeNull()
  })

  test("a topic's link to Peek gets no link for an id no file can have", () => {
    expect(topicInPeek('https://peek.estiva.app/o/<bech32>', `30840:${SHIP_KEY}:x-${D}`, 'Plans', { byKind: { 30840: 'topic' } })).toBeUndefined()
    expect(topicInPeek('https://peek.estiva.app/o/<bech32>', `30840:${SHIP_KEY}:${D}`, 'Plans', { byKind: { 30840: 'topic' } })).toBe(
      `https://peek.estiva.app/topic/plans-${D}`,
    )
  })

  test("an address's id is read whole, colons included", () => {
    expect(addressParts(`30851:${SHIP_KEY}:a:${D}`)).toEqual({ kind: 30851, pubkey: SHIP_KEY, d: `a:${D}` })
  })
})
