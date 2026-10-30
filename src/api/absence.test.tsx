/**
 * Deleted, apart from not this reader's to see (SPEC §13.6.1; widget review
 * 56): asked of the relay once a file's read came back empty, by the
 * protocol's read, and only then. The relay is faked at `relay.query`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { addrToNaddr } from '@estiva-app/protocol'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('./store', () => ({ relay: { query } }))

import { resetAbsenceForTests, useDeleted } from './absence'

const AUTHOR = 'b'.repeat(64)
const ADDRESS = `30851:${AUTHOR}:a0b27d90-d5b9-40e7-8078-865ab36a421c`
const REFERENCE = `nostr:${addrToNaddr(ADDRESS, [])}`
const deletion = { id: 'd'.repeat(64), kind: 5, pubkey: AUTHOR, created_at: 1, tags: [['a', ADDRESS]], content: '', sig: '0'.repeat(128) }

beforeEach(() => {
  query.mockReset()
  resetAbsenceForTests()
})

describe('useDeleted', () => {
  it('says deleted for an empty read when the author’s own deletion names the address, asking by its `a`', async () => {
    query.mockResolvedValue([deletion])
    const { result } = renderHook(() => useDeleted(REFERENCE, true))
    await waitFor(() => expect(result.current).toBe(true))
    expect(query.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ kinds: [5], '#a': [ADDRESS] })]))
  })

  it('says not deleted when no deletion names it', async () => {
    query.mockResolvedValue([])
    const { result } = renderHook(() => useDeleted(REFERENCE, true))
    await waitFor(() => expect(query).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it('asks nothing for a file that was read, or for a message, which no deletion names by `a`', () => {
    renderHook(() => useDeleted(REFERENCE, false))
    renderHook(() => useDeleted(`nostr:nevent1qqs${'q'.repeat(58)}`, true))
    expect(query).not.toHaveBeenCalled()
  })
})
