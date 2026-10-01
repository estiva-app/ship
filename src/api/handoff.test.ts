import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addrToNaddr } from '@estiva-app/protocol'

const query = vi.fn()
const resolveForeign = vi.fn()
vi.mock('./store', () => ({ relay: { query: (filters: unknown) => query(filters) } }))
vi.mock('./foreign', () => ({ resolveForeign: (reference: string) => resolveForeign(reference) }))

const { resolveHandoff } = await import('./handoff')

const D = '2a48e88d-d999-4ebf-a1de-1668880a8cdc'
const PK = 'f'.repeat(64)
const PEEK = {
  kind: 31990,
  content: JSON.stringify({ name: 'Peek' }),
  tags: [
    ['k', '39000'],
    ['web', 'https://peek.estiva.app/o/<bech32>', 'naddr'],
    ['urls', 'https://peek.estiva.app/topic/<slug>-<d>', '30840'],
  ],
}
const SHIP = { kind: 31990, tags: [['urls', 'https://ship.estiva.app/issue/<slug>-<d>', '30851']] }

/** The relay: manifests for a 31990 read, `files` for anything else. */
function relayWith(files: { kind: number; pubkey: string; id: string; created_at: number }[]) {
  query.mockImplementation(async (filters: { kinds?: number[] }[]) => (filters[0].kinds?.includes(31990) ? [PEEK, SHIP] : files))
}

beforeEach(() => {
  query.mockReset()
  resolveForeign.mockReset()
})

describe('resolveHandoff', () => {
  it('asks for the declared kind by `d` and resolves the file through its app', async () => {
    relayWith([{ kind: 30840, pubkey: PK, id: 'e1', created_at: 1 }])
    // What production answers for a topic: drawn as a bare file, named "File".
    resolveForeign.mockResolvedValue({ ref: 'r', appName: 'File', openUrl: 'https://elsewhere.example/x' })
    const handoff = await resolveHandoff('topic', `level-2-${D}`)
    expect(query).toHaveBeenLastCalledWith([{ kinds: [30840], '#d': [D], limit: 10 }])
    expect(resolveForeign).toHaveBeenCalledWith(`30840:${PK}:${D}`)
    // The owner's name and the owner's `web` link — the manifest that declared `topic`.
    expect(handoff).toEqual({
      state: 'found',
      object: expect.objectContaining({ appName: 'File' }),
      app: 'Peek',
      openUrl: `https://peek.estiva.app/o/${addrToNaddr(`30840:${PK}:${D}`)}`,
    })
  })

  it('says a file of Ship’s own is Ship’s, for the page to open it here (rule 4)', async () => {
    relayWith([{ kind: 30851, pubkey: PK, id: 'e1', created_at: 1 }])
    expect(await resolveHandoff('note', D)).toEqual({ state: 'own', kind: 30851, d: D })
    expect(resolveForeign).not.toHaveBeenCalled()
  })

  it('says nothing was found rather than drawing an empty file', async () => {
    relayWith([])
    expect(await resolveHandoff('topic', D)).toEqual({ state: 'missing' })
  })

  it('tells a file no app opens apart from a missing one', async () => {
    relayWith([{ kind: 30840, pubkey: PK, id: 'e1', created_at: 1 }])
    resolveForeign.mockResolvedValue(null)
    expect(await resolveHandoff('topic', D)).toEqual({ state: 'unclaimed' })
  })
})
