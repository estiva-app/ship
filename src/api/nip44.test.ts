import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({ ID_CONFIG: { base: 'https://id.test/' } }))
vi.mock('../auth/estivaId', () => ({ currentToken: () => ({ accessToken: 't' }) }))

import { nip44UnlessRefused } from './nip44'

/** `/nip44/decrypt` answering with this status (and the plaintext on a 200). */
function answer(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(status === 200 ? JSON.stringify({ plaintext: 'markers' }) : 'refused', { status })))
}

afterEach(() => vi.unstubAllGlobals())

/*
 * The read-state seam. A slot that answers `undefined` is dropped as a rotated
 * key, so the person's read markers in it are lost and read things show unread
 * again; a slot that throws keeps its last markers (Peek 23130326). Every other
 * test mocks this module, so this is the one place the split is checked.
 */
describe('nip44UnlessRefused.decrypt', () => {
  it('answers the plaintext', async () => {
    answer(200)
    await expect(nip44UnlessRefused.decrypt('c')).resolves.toBe('markers')
  })

  it.each([429, 401, 403, 408, 422, 500, 503])('throws on a %i, so the slot keeps its markers', async (status) => {
    answer(status)
    await expect(nip44UnlessRefused.decrypt('c')).rejects.toThrow(String(status))
  })

  it('throws when the service does not answer at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(nip44UnlessRefused.decrypt('c')).rejects.toThrow('Failed to fetch')
  })

  it('answers undefined on a 400, a ciphertext that will never decrypt', async () => {
    answer(400)
    await expect(nip44UnlessRefused.decrypt('c')).resolves.toBeUndefined()
  })
})
