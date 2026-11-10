/**
 * "Move to Folder…" at the wire (TEA-3): what the relay is sent, and the
 * sentence the person reads after it. Nothing between the click and the relay
 * is mocked — the dialog, `moveProject`, the Store, the planner, the signer
 * and the relay client all run. The relay is faked at `fetch`: `POST /events`
 * answers as each case says, with the relay's real refusal texts.
 *
 * Mocked: the clock check, each Folder's listing read, and the Folder re-read
 * (`reloadFolders`), which a case asserts was asked for.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Signed = { id: string; kind: number; pubkey: string; sig: string; tags: string[][]; content: string }

const wire = vi.hoisted(() => {
  const wire = {
    published: [] as Signed[],
    /** The relay's answer to the nth move, from 0; accepted when it returns nothing. */
    refuse: (_index: number): string | undefined => undefined,
  }
  // Before any module loads: the relay client looks `fetch` up when it sends, and this is the wire.
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      wire.published.push(event)
      const message = wire.refuse(wire.published.length - 1)
      return new Response(JSON.stringify(message ? { accepted: false, message, event_id: event.id } : { accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return wire
})

const AUTHOR = 'f'.repeat(64)
const PROJECT_ADDR = `30850:${AUTHOR}:00000000-0000-4000-8000-000000000001`
const OWN = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const TARGET = '3167adea-877f-43c4-96fb-517a2b2d5d24'

vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  // A Folder whose state names the project lists it.
  readFolderListing: vi.fn(async (folder: string) => (listing.has(folder) ? [{ ref: PROJECT_ADDR, address: PROJECT_ADDR }] : [])),
}))
vi.mock('@/api/useFolders', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/useFolders')>()), reloadFolders: vi.fn(async () => {}) }))

import { reloadFolders } from '@/api/useFolders'
import { MoveProject } from './MoveProject'

let listing = new Set<string>()
const project = { addr: PROJECT_ADDR, id: '1', author: AUTHOR, createdAt: 1, title: 'Billing', description: '', descriptionFormat: 'marker' as const, contentFolder: OWN, key: 'BIL', status: 'planned', archived: false, fields: {} }
const team = (id: string, name: string) => ({ id, name, hasState: true, addresses: listing.has(id) ? [PROJECT_ADDR] : [] })
const tag = (event: Signed, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const moves = () => wire.published.filter((event) => event.kind === 1852).map((event) => [tag(event, 'op'), tag(event, 'h'), tag(event, 'from') ?? null])

beforeEach(() => {
  wire.published.length = 0
  wire.refuse = () => undefined
  vi.mocked(reloadFolders).mockClear()
})

async function move(listed: string[], teams: [string, string][], to: string) {
  listing = new Set(listed)
  const say = vi.fn()
  render(<MoveProject project={project} teams={teams.map(([id, name]) => team(id, name))} say={say} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
  await userEvent.click(await screen.findByRole('option', { name: to }))
  fireEvent.click(screen.getByRole('button', { name: 'Move' }))
  await waitFor(() => expect(say).toHaveBeenCalled())
  return say
}

describe('Move to team…', () => {
  it('a project no Folder lists is placed in the one chosen — never moved out of its own Folder, which holds none of it', async () => {
    const say = await move([], [[OWN, 'Own'], [TARGET, 'Target']], 'Target')
    expect(moves()).toEqual([['add', TARGET, null]])
    expect(say).toHaveBeenCalledWith('Moved to Target')
  })

  it('a second move refused names only that Folder, says why, and offers no retry an archived Folder cannot take', async () => {
    wire.refuse = (index) => (index === 1 ? 'invalid: team 31afb7af is archived; its list does not change' : undefined)
    const say = await move([A, C, D], [[A, 'Alpha'], [C, 'Gamma'], [D, 'Delta'], [TARGET, 'Target']], 'Target')
    // The third Folder was never sent to: publishing stops at the refusal.
    expect(moves()).toEqual([['move', TARGET, A], ['move', TARGET, C]])
    expect(say).toHaveBeenCalledWith('Moved to Target, but Gamma still lists it too: one of the teams is archived.', 'error')
  })

  it('a second move refused with no reason code and no words Ship knows (a relay before reason codes) asks to move it again', async () => {
    wire.refuse = (index) => (index === 1 ? 'invalid: rate-limited' : undefined)
    const say = await move([A, C], [[A, 'Alpha'], [C, 'Gamma'], [TARGET, 'Target']], 'Target')
    expect(say).toHaveBeenCalledWith('Moved to Target, but Gamma still lists it too. Try moving it again.', 'error')
  })

  // TEA-9: a reason code Ship says nothing for (one it does not know, or leaves-by-moving) would refuse the same move again, so it never asks to move it again.
  it.each([['invalid: frozen: the team is archived'], ['invalid: leaves-by-moving: a topic leaves a team only by a move']])(
    'a second move refused with a reason code Ship says nothing for names the Folder that still lists it, and never asks to move it again: %s',
    async (refusal) => {
      wire.refuse = (index) => (index === 1 ? refusal : undefined)
      const say = await move([A, C], [[A, 'Alpha'], [C, 'Gamma'], [TARGET, 'Target']], 'Target')
      expect(moves()).toEqual([['move', TARGET, A], ['move', TARGET, C]])
      expect(say).toHaveBeenCalledWith('Moved to Target, but Gamma still lists it too.', 'error')
    },
  )

  it('a move refused because the Folders changed says so in Ship’s words, and reads the Folders again so Move can succeed', async () => {
    wire.refuse = () => 'invalid: the team a move leaves lists none of its files'
    const say = await move([A], [[A, 'Alpha'], [TARGET, 'Target']], 'Target')
    expect(say).toHaveBeenCalledWith('Nothing was moved: the teams changed since you opened this. Try again.', 'error')
    expect(reloadFolders).toHaveBeenCalled()
  })
})
