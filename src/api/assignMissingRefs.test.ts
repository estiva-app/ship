import { describe, expect, it, vi } from 'vitest'

// `vi.hoisted`: `vi.mock` is lifted above every declaration, so a factory
// closing over a plain const throws "Cannot access before initialization".
/*
  Typed with its argument. A zero-parameter mock gives `mock.calls` the tuple
  type `[]`, so reading `calls[0][0]` is a type error — which `vitest` never
  sees, because it strips types rather than checking them. Third time today;
  `npm run build` is what says so.
*/
type SetFieldArgs = { folder: string; target: string; field: string; value: string; note?: string }
const { setField } = vi.hoisted(() => ({
  setField: vi.fn(async (_args: { folder: string; target: string; field: string; value: string; note?: string }) => ({ ok: true })),
}))
vi.mock('./store', () => ({ store: { setField }, signer: { pubkey: 'a'.repeat(64) } }))
vi.mock('./clock', () => ({ clockProblem: async () => undefined }))

import type { Issue, Project } from '../nostr/fold'
import { assignMissingRefs, settleClaims } from './writes'

const project = (d: string, title: string, key?: string, createdAt = 1) =>
  ({ addr: `30850:a:${d}`, title, key, contentFolder: 'f', createdAt, fields: {} } as unknown as Project)
const payments = project('p1', 'Payment integration', 'PAY')
const issue = (d: string, ref?: string, createdAt = 1, projectAddr = payments.addr) =>
  ({ addr: `30851:a:${d}`, folder: 'f', ref, createdAt, projectAddr, fields: {} } as unknown as Issue)
const visible = (issues: Issue[], projects: Project[] = [payments]) => ({ projects, issues })

const valuesWritten = (field = 'ref') =>
  setField.mock.calls.map((c): SetFieldArgs => c[0]).filter((a) => a.field === field).map((a) => a.value)

describe('assignMissingRefs — Ship numbers what Ship can number', () => {
  it('continues the project’s own numbering', async () => {
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('a', 'PAY-1'), issue('b', 'PAY-2'), issue('c')]))
    expect(valuesWritten()).toEqual(['PAY-3'])
  })

  it('numbers a whole batch in one pass, not all the same', async () => {
    /*
      The bug this exists to prevent. `nextRef` counts the refs it is given, so
      calling it once per issue against unrefreshed state hands every one of
      them the same number.
    */
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('a', 'PAY-1'), issue('b'), issue('c'), issue('d')]))
    expect(valuesWritten()).toEqual(['PAY-2', 'PAY-3', 'PAY-4'])
  })

  it('numbers in the order the issues were filed', async () => {
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('late', undefined, 300), issue('early', undefined, 100)]))
    const targets = setField.mock.calls.map((c): string => c[0].target)
    expect(targets).toEqual(['30851:a:early', '30851:a:late'])
  })

  it('writes nothing when every issue already has a key', async () => {
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('a', 'PAY-1')]))
    expect(setField).not.toHaveBeenCalled()
  })

  it('writes a change, never the root', async () => {
    // Ship cannot rewrite a root it did not sign — a NIP-33 address is
    // (kind, pubkey, d). A change event is the only move available, and it is
    // why `ref` is folded at all.
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('new')]))
    expect(setField).toHaveBeenCalledWith(expect.objectContaining({ target: '30851:a:new', folder: 'f', field: 'ref' }))
  })

  it('counts every visible issue under the key, not only the project’s own (SHI-4)', async () => {
    /*
      What production did on 13 Oct 2026: two agent-filed issues in two new
      projects titled "Shiprobe …" were both numbered SHI-1, beside the real
      SHI-1 in Ship: Feedback & Bugs, because only the siblings were counted.
      An issue that moved to another project still holds its number, too.
    */
    setField.mockClear()
    const elsewhere = project('p2', 'Elsewhere', 'ELS')
    await assignMissingRefs(payments, visible([issue('moved', 'PAY-7', 1, elsewhere.addr), issue('new')], [payments, elsewhere]))
    expect(valuesWritten()).toEqual(['PAY-8'])
  })

  it('gives a keyless project its key first, then numbers from it', async () => {
    // Made before keys, or by an app that set none: "Shiprobe Alpha" may not
    // take SHI, which Ship: Feedback & Bugs holds by its 43 refs.
    setField.mockClear()
    const bugs = project('bugs', 'Ship: Feedback & Bugs')
    const alpha = project('alpha', 'Shiprobe Alpha', undefined, 2)
    await assignMissingRefs(alpha, visible([issue('s1', 'SHI-1', 1, bugs.addr), issue('new', undefined, 3, alpha.addr)], [bugs, alpha]))
    expect(valuesWritten('key')).toEqual(['SHIP'])
    expect(valuesWritten()).toEqual(['SHIP-1'])
    expect(setField.mock.calls[0][0]).toEqual(expect.objectContaining({ target: alpha.addr, field: 'key' }))
  })
})

describe('settleClaims — the later claim moves, and only its own client moves it', () => {
  it('moves a ref this tab claimed after an earlier claim on the same number', async () => {
    setField.mockClear()
    // This tab numbered `ours` PAY-1 (a write the mock accepted)…
    await assignMissingRefs(payments, visible([issue('ours', undefined, 200)]))
    // …and the read back shows somebody else's PAY-1, claimed first.
    const theirs = issue('theirs', 'PAY-1', 100)
    const ours = { ...issue('ours', 'PAY-1', 200), fields: { ref: { value: 'PAY-1', by: 'me', at: 201, format: 'marker' } } } as unknown as Issue
    setField.mockClear()
    await settleClaims(visible([theirs, ours]))
    expect(setField).toHaveBeenCalledTimes(1)
    expect(setField.mock.calls[0][0]).toEqual(expect.objectContaining({ target: ours.addr, field: 'ref', value: 'PAY-2' }))
  })

  it('moves a losing claim once, not again on every refresh that still shows it', async () => {
    setField.mockClear()
    await assignMissingRefs(payments, visible([issue('again', undefined, 200)]))
    const theirs = issue('first', 'PAY-1', 100)
    const ours = { ...issue('again', 'PAY-1', 200), fields: { ref: { value: 'PAY-1', by: 'me', at: 201, format: 'marker' } } } as unknown as Issue
    setField.mockClear()
    await settleClaims(visible([theirs, ours]))
    await settleClaims(visible([theirs, ours]))
    expect(setField).toHaveBeenCalledTimes(1)
  })

  it('leaves a duplicate it did not make — old duplicates stay', async () => {
    setField.mockClear()
    await settleClaims(visible([issue('x', 'PEE-8', 100), issue('y', 'PEE-8', 200)]))
    expect(setField).not.toHaveBeenCalled()
  })
})
