// @vitest-environment jsdom
/**
 * Adding people from the Members dialog (SHI-31), at the wire: one `kind:1851`
 * per person, and the first refusal ends it. Nothing between `onAdd` and the
 * relay is mocked — `act`, `setMembership`, the Store, the signer and the relay
 * client all run. The relay is faked at `fetch`: `POST /events` refuses the
 * change for whoever is in `refuse` and accepts the rest. Mocked: the clock
 * check, which would otherwise ask the relay for its time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Signed = { id: string; kind: number; pubkey: string; sig: string; tags: string[][]; content: string }

const { published, refuse } = vi.hoisted(() => {
  const published: Signed[] = []
  const refuse = new Set<string>()
  // Before any module loads: the relay client looks `fetch` up when it sends, and this is the wire.
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST' && path.endsWith('/events')) {
      const event = JSON.parse(String(init.body)) as Signed
      published.push(event)
      const field = event.tags.find((t) => t[0] === 'field')?.[1] ?? ''
      const refused = [...refuse].some((pubkey) => field.endsWith(pubkey))
      return new Response(JSON.stringify(refused ? { accepted: false, message: 'restricted: not a channel member' } : { accepted: true, event_id: event.id }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/query')) return new Response('[]', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { published, refuse }
})

vi.mock('@/api/clock', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/clock')>()), clockProblem: vi.fn(async () => null) }))

import type { Issue } from '@/api'
import { resetRelayBudget } from '@/lib/relayBudget'
import { membershipActions } from './membership'

const FOLDER = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const ISSUE_ADDR = `30851:${'f'.repeat(64)}:00000000-0000-4000-8000-000000000011`
const KATERINA = '01'.repeat(32)
const MIKY = '02'.repeat(32)
const names: Record<string, string> = { [KATERINA]: 'Katerina', [MIKY]: 'Miky' }

const issue = { kind: 'issue', issue: { addr: ISSUE_ADDR, folder: FOLDER } as Issue } as const
const changesFor = (pubkey: string) => published.filter((event) => event.kind === 1851 && event.tags.some((t) => t[0] === 'field' && t[1].endsWith(pubkey)))

beforeEach(() => {
  published.length = 0
  refuse.clear()
  resetRelayBudget()
})

describe('adding people from the Members dialog', () => {
  it('sends one kind:1851 per person, into the issue’s Folder, and resolves true', async () => {
    const after = vi.fn(async () => {})
    const { onAdd } = membershipActions(issue, 'Invoice totals', (p) => names[p], () => {}, after)
    expect(await onAdd([KATERINA, MIKY])).toBe(true)
    expect(changesFor(KATERINA)).toHaveLength(1)
    expect(changesFor(MIKY)).toHaveLength(1)
    expect(published.every((event) => event.tags.some((t) => t[0] === 'h' && t[1] === FOLDER))).toBe(true)
    expect(after).toHaveBeenCalledOnce()
  })

  /*
    Read as "skip and carry on", a refusal of the first person still sends the
    second and resolves true — the dialog closes as if everyone was added after
    the relay refused one.
  */
  it('stops at the first refusal: nothing is sent for the next person, and it resolves false', async () => {
    refuse.add(KATERINA)
    const said: string[] = []
    const after = vi.fn(async () => {})
    const { onAdd } = membershipActions(issue, 'Invoice totals', (p) => names[p], (t) => said.push(t), after)
    expect(await onAdd([KATERINA, MIKY])).toBe(false)
    expect(changesFor(KATERINA)).toHaveLength(1)
    expect(changesFor(MIKY)).toHaveLength(0)
    expect(said).toEqual(['Nothing changed: Katerina could not be added to “Invoice totals”. restricted: not a channel member'])
    expect(after).toHaveBeenCalledOnce()
  })
})
