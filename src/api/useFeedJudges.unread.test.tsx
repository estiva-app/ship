import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  A project you never joined shows no unread dots (SPEC §11.8, CON-19). Ship
  reads every project in the workspace, so being able to open one says nothing
  about whether you belong to it. This goes through the judge the project page
  is handed, into `unreadByThread`, which is what draws the divider: the facts
  under it are covered in `useFeedJudges.test.ts`, the verdict a page acts on
  is covered here (PEE-50 planted it, and nothing went red).
*/
const ME = 'c'.repeat(64)
const OWNER = 'a'.repeat(64)
const ELSE = 'd'.repeat(64)
const PROJECT = { addr: `30850:${OWNER}:the-project`, createdAt: 1000 }
const FOLDER = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'

/** The project's record channel, which its page also judges (its chat, not its issue threads). */
const CHANNEL = 'e2a9c4f1-7b3d-4c58-a6e0-1f9d2b7c8a35'

let onRelay: SignedEvent[] = []
/** What the reader's mute list decrypts to; the real `nip44` contract is covered by its own tests. */
let mutePlaintext: string | undefined
vi.mock('./store', () => ({
  relay: { queryAll: async () => onRelay },
  signer: { pubkey: 'c'.repeat(64) },
}))
vi.mock('./nip44', () => ({ nip44: { decrypt: async () => mutePlaintext } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))
vi.mock('@/lib/useRefresh', () => ({ useRefresh: () => {} }))

const { useFeedJudges, resetFeedFactsForTests } = await import('./useFeedJudges')
const { unreadByThread } = await import('./unreadFeed')
const { foldFolder } = await import('../nostr/fold')

let n = 0
/** A comment on the project as Ship publishes one: NIP-22, the project as its root. */
const comment = (pubkey: string, at: number, content: string): SignedEvent => ({
  id: (++n).toString(16).padStart(64, '0'),
  pubkey,
  kind: 1111,
  created_at: at,
  tags: [['A', PROJECT.addr], ['a', PROJECT.addr], ['K', '30850'], ['h', FOLDER]],
  content,
  sig: '0'.repeat(128),
})

/** The threads the project page would mark new, for whoever is signed in, with no read marker yet. */
async function dotsFor(events: SignedEvent[], channel?: string) {
  onRelay = events
  const { result } = renderHook(() => useFeedJudges(PROJECT, channel))
  await waitFor(() => expect(result.current.file).toBeDefined())
  const judge = result.current.file
  const { conversations } = foldFolder(events, () => [])
  return unreadByThread(conversations, {}, () => judge)
}

beforeEach(() => {
  resetFeedFactsForTests()
  onRelay = []
  mutePlaintext = undefined
})

/** The reader's mute list as Peek writes it (§12: a `kind:30078` encrypted to self), holding `keys`. */
function muteList(keys: string[]): SignedEvent {
  mutePlaintext = JSON.stringify({ v: 1, updatedAt: 1700, keys })
  return {
    id: (++n).toString(16).padStart(64, '0'),
    pubkey: ME,
    kind: 30078,
    created_at: 1700,
    tags: [['d', 'estiva:muted:v1'], ['t', 'estiva-appdata']],
    content: 'ciphertext',
    sig: '0'.repeat(128),
  }
}

describe('unread dots on a project page', () => {
  it('shows none on a project you can read but never joined', async () => {
    const dots = await dotsFor([comment(ELSE, 2000, 'Shipping Friday.')])
    expect(dots).toEqual({})
  })

  it('shows one once you have joined it by commenting, for what came after', async () => {
    const mine = comment(ME, 1500, 'Count me in.')
    const theirs = comment(ELSE, 2000, 'Shipping Friday.')
    const dots = await dotsFor([mine, theirs])
    expect(Object.values(dots).flat()).toEqual([theirs.id])
  })

  it('shows none on the issue threads of a project you muted, on a page that also has a record channel', async () => {
    const mine = comment(ME, 1500, 'Count me in.')
    const theirs = comment(ELSE, 2000, 'Shipping Friday.')
    const dots = await dotsFor([mine, muteList([PROJECT.addr]), theirs], CHANNEL)
    expect(dots).toEqual({})
  })

  it('still shows one when only the project’s chat is muted, so the case above is the project’s own mute at work', async () => {
    const mine = comment(ME, 1500, 'Count me in.')
    const theirs = comment(ELSE, 2000, 'Shipping Friday.')
    const dots = await dotsFor([mine, muteList([CHANNEL]), theirs], CHANNEL)
    expect(Object.values(dots).flat()).toEqual([theirs.id])
  })
})
