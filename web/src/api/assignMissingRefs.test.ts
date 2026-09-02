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

import type { Issue, Project } from '../../../src/fold'
import { assignMissingRefs } from './writes'

const project = { addr: '30850:a:p1', title: 'Payment integration', originFolder: 'f', contentFolder: 'f' } as Project
const issue = (d: string, ref?: string, createdAt = 1) =>
  ({ addr: `30851:a:${d}`, folder: 'f', ref, createdAt } as Issue)

const valuesWritten = () =>
  setField.mock.calls.map((c): SetFieldArgs => c[0]).filter((a) => a.field === 'ref').map((a) => a.value)

describe('assignMissingRefs — Ship numbers what Ship can number', () => {
  it('continues the project’s own numbering', async () => {
    /*
      The key is the project title's first three letters and a count of its
      siblings — which is exactly why a consumer creating through the manifest
      cannot produce one. It cannot see the siblings.
    */
    setField.mockClear()
    await assignMissingRefs(project, [issue('a', 'PAY-1'), issue('b', 'PAY-2'), issue('c')])
    expect(valuesWritten()).toEqual(['PAY-3'])
  })

  it('numbers a whole batch in one pass, not all the same', async () => {
    /*
      The bug this exists to prevent. `nextRef` counts the refs it is given, so
      calling it once per issue against unrefreshed state hands every one of
      them the same number.
    */
    setField.mockClear()
    await assignMissingRefs(project, [issue('a', 'PAY-1'), issue('b'), issue('c'), issue('d')])
    expect(valuesWritten()).toEqual(['PAY-2', 'PAY-3', 'PAY-4'])
  })

  it('numbers in the order the issues were filed', async () => {
    setField.mockClear()
    await assignMissingRefs(project, [issue('late', undefined, 300), issue('early', undefined, 100)])
    const targets = setField.mock.calls.map((c): string => c[0].target)
    expect(targets).toEqual(['30851:a:early', '30851:a:late'])
  })

  it('writes nothing when every issue already has a key', async () => {
    setField.mockClear()
    await assignMissingRefs(project, [issue('a', 'PAY-1')])
    expect(setField).not.toHaveBeenCalled()
  })

  it('writes a change, never the root', async () => {
    // Ship cannot rewrite a root it did not sign — a NIP-33 address is
    // (kind, pubkey, d). A change event is the only move available, and it is
    // why `ref` is folded at all.
    setField.mockClear()
    await assignMissingRefs(project, [issue('new')])
    expect(setField).toHaveBeenCalledWith(expect.objectContaining({ target: '30851:a:new', folder: 'f', field: 'ref' }))
  })
})
