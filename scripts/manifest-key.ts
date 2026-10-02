/**
 * The live manifest key, or the reason it is not there.
 *
 * `.manifest-key` is the only copy of the key behind Ship's manifest address,
 * and every `kind:31989` anybody has published points at that address. So this
 * only reads it: no fallback key, no write, and so nothing written through a
 * symlink to the real file. Anything other than the key of `address` is a
 * refusal — a missing file, a malformed one, or a well-formed key for some other
 * pubkey, which would publish a second manifest competing with the live one.
 *
 * A deliberate move to a new key is done by hand, in one PR: the new key in
 * place and `src/nostr/manifest-address.ts` edited to its pubkey.
 */
import { existsSync, readFileSync } from 'node:fs'
import { publicKeyFromSecret } from '@estiva-app/protocol'

export type ManifestKey = { secretKeyHex: string; pubkey: string }

export function readManifestKey(keyFile: string, address: string, dTag: string): ManifestKey | { refused: string } {
  const [kind, pubkey, d] = address.split(':')
  // The address is no longer rewritten after a publish, so it has to already
  // name what the publish will produce.
  if (kind !== '31990' || d !== dTag) {
    return { refused: `${address} is not 31990:<pubkey>:${dTag}, which is what would be published` }
  }
  if (!existsSync(keyFile)) return { refused: `there is no ${keyFile} for ${address}` }
  const secretKeyHex = readFileSync(keyFile, 'utf8').trim()
  if (!/^[0-9a-f]{64}$/.test(secretKeyHex)) {
    return { refused: `${keyFile} is not a 64-character hex key, so it cannot be the key of ${address}` }
  }
  let derived: string
  try {
    derived = publicKeyFromSecret(secretKeyHex)
  } catch {
    return { refused: `${keyFile} is not a valid secret key, so it cannot be the key of ${address}` }
  }
  if (derived !== pubkey) return { refused: `${keyFile} is not the key of ${address}` }
  return { secretKeyHex, pubkey }
}
