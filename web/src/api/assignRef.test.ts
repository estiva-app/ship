import { describe, expect, it, vi } from 'vitest'

// `vi.hoisted`: `vi.mock` is lifted above every declaration, so a factory
// closing over a plain const throws "Cannot access before initialization".
const { setField } = vi.hoisted(() => ({ setField: vi.fn(async () => ({ ok: true })) }))
vi.mock('./store', () => ({ store: { setField }, signer: { pubkey: 'a'.repeat(64) } }))
vi.mock('./clock', () => ({ clockProblem: async () => undefined }))

import type { Issue, Project } from '../../../src/fold'
import { assignRef } from './writes'

const project = { addr: '30850:a:p1', title: 'Payment integration', originFolder: 'f', contentFolder: 'f' } as Project
const issue = (ref?: string) => ({ addr: `30851:a:${ref ?? 'new'}`, folder: 'f', ref } as Issue)

describe('assignRef — a display key for an issue that arrived without one', () => {
  it('continues the project’s own numbering', async () => {
    /*
      The key is the project title's first three letters and a count of its
      siblings — which is exactly why a consumer creating through the manifest
      cannot produce one. It cannot see the siblings.
    */
    setField.mockClear()
    await assignRef(issue(), project, [issue('PAY-1'), issue('PAY-2')])
    expect(setField).toHaveBeenCalledWith(expect.objectContaining({ field: 'ref', value: 'PAY-3' }))
  })

  it('starts at one when the project has none', async () => {
    setField.mockClear()
    await assignRef(issue(), project, [])
    expect(setField).toHaveBeenCalledWith(expect.objectContaining({ field: 'ref', value: 'PAY-1' }))
  })

  it('writes a change, never the root', async () => {
    // Ship cannot rewrite a root it did not sign — a NIP-33 address is
    // (kind, pubkey, d). A change event is the only move available, and it is
    // why `ref` is folded at all.
    setField.mockClear()
    await assignRef(issue(), project, [])
    expect(setField).toHaveBeenCalledWith(expect.objectContaining({ target: '30851:a:new', folder: 'f' }))
  })
})
