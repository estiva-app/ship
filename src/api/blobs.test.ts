/**
 * The media fetch sends a signed get-token only to this workspace's relay, and
 * never keeps a served type that would run in Ship's origin (COM-2, as Peek's
 * `media.origin.test.ts`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchBlob = vi.hoisted(() => vi.fn())
vi.mock('@estiva-app/protocol', async (actual) => ({ ...(await actual<object>()), fetchBlob }))
vi.mock('../config', () => ({ RELAY_URL: 'https://estiva.example' }))
vi.mock('./store', () => ({ signer: { pubkey: 'a'.repeat(64), sign: vi.fn() } }))

import { blobObjectUrl, clearBlobCache, safeBlobType } from './blobs'

afterEach(() => {
  clearBlobCache()
  fetchBlob.mockReset()
})

describe('blobObjectUrl', () => {
  it("refuses another origin's media before signing anything", async () => {
    await expect(blobObjectUrl('https://evil.example/media/abc')).rejects.toThrow(/not this relay's media/)
    expect(fetchBlob).not.toHaveBeenCalled()
  })

  it("fetches this relay's media", async () => {
    fetchBlob.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: 'image/png' })
    await expect(blobObjectUrl('https://estiva.example/media/abc')).resolves.toMatch(/^blob:/)
    expect(fetchBlob).toHaveBeenCalledOnce()
  })
})

describe('safeBlobType', () => {
  it('keeps a picture and a PDF', () => {
    expect(safeBlobType('image/png')).toBe('image/png')
    expect(safeBlobType('application/pdf; charset=binary')).toBe('application/pdf')
  })
  it('makes anything else bytes: text/html would run as Ship', () => {
    expect(safeBlobType('text/html')).toBe('application/octet-stream')
    expect(safeBlobType('image/svg+xml')).toBe('application/octet-stream')
    expect(safeBlobType(undefined)).toBe('application/octet-stream')
  })
})
