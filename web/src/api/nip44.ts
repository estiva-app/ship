/**
 * NIP-44 self-encryption through Estiva ID (CRO-8).
 *
 * Ship holds no key, so encryption is a round trip exactly as signing is. The
 * endpoints are scoped to **self-encryption only** (CRO-1): they refuse a peer
 * pubkey with a `400` rather than ignoring one, which is deliberate — ignoring
 * it would hand back a self-encrypted blob to code that believed it was
 * encrypting to somebody else, and the mistake would surface days later as an
 * undecryptable message.
 *
 * Read state is the only caller today. It is a general capability, so it lives
 * on its own rather than inside `readState.ts`.
 */
import { ID_CONFIG } from '../config'
import { currentToken } from '../auth/estivaId'
import type { Nip44 } from './readState'

async function call(op: 'encrypt' | 'decrypt', body: object): Promise<unknown> {
  const token = currentToken()
  if (!ID_CONFIG || !token) throw new Error(`/nip44/${op}: no Estiva ID session`)
  const response = await fetch(`${ID_CONFIG.base.replace(/\/+$/, '')}/nip44/${op}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    // 429 is real: the endpoint allows 120 operations per minute per app per
    // person, shared between encrypt and decrypt. Read-state writes are
    // debounced, so single digits per minute is the expected shape.
    throw new Error(`POST /nip44/${op} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

/**
 * The seam `readState.ts` takes.
 *
 * `decrypt` returns `undefined` for anything unreadable rather than throwing: a
 * blob written under a rotated key is the realistic cause, and it should cost
 * the state it held, never the read that asked for it.
 */
export const nip44: Nip44 = {
  async encrypt(plaintext) {
    const { ciphertext } = (await call('encrypt', { plaintext })) as { ciphertext: string }
    return ciphertext
  },
  async decrypt(ciphertext) {
    try {
      const { plaintext } = (await call('decrypt', { ciphertext })) as { plaintext: string }
      return plaintext
    } catch {
      return undefined
    }
  },
}
