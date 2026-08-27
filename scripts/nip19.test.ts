/**
 * NIP-19 round-trip and interop checks.
 *
 * The vector below is from the NIP-19 specification itself, not from this
 * encoder — a round-trip test alone would happily pass on a wrong checksum
 * constant, since it would be wrong in both directions.
 *
 *   npx tsx scripts/nip19.test.ts
 */
import { hexToBytes } from '@noble/hashes/utils'
import {
  addrToNaddr,
  bech32Decode,
  bech32Encode,
  convertBits,
  decodeNaddr,
  findNaddrs,
  naddrToAddr,
} from '@estiva-app/protocol'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

// ── The external vector ────────────────────────────────────────────────────
// The canonical NIP-19 `npub` example. This is the check that matters: the
// checksum layer round-trips against itself even with the wrong constant, so
// only a string produced by someone else's implementation catches a bech32m
// slip. `npub` is a bare bech32 payload with no TLV, which isolates exactly
// that layer.
const SPEC_PUBKEY = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
const SPEC_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'

const encodedNpub = bech32Encode('npub', convertBits(hexToBytes(SPEC_PUBKEY), 8, 5, true))
check('encodes the canonical npub vector', encodedNpub === SPEC_NPUB, encodedNpub)

const decodedNpub = bech32Decode(SPEC_NPUB)
const decodedHex = Buffer.from(convertBits(decodedNpub.data, 5, 8, false)).toString('hex')
check('decodes it back to the right pubkey', decodedHex === SPEC_PUBKEY, decodedHex.slice(0, 16))

// A realistic Estiva Ship issue: UUID `d` tag, well past bech32's 90-char cap.
const address = '30851:88ac6aae1a874652ef05e2deba8c8a9526cda0c78e6b7d98b815cd0b5a710d13:9f1b4a2c-7e3d-4c8a-9b2e-1d5f6a7b8c9d'
const naddr = addrToNaddr(address, ['http://localhost:3000'])
check('round-trips a Ship issue address', naddrToAddr(naddr) === address, `${naddr.length} chars`)
check('carries the relay hint', decodeNaddr(naddr).relays[0] === 'http://localhost:3000')
check('exceeds bech32\'s 90-char cap, as NIP-19 allows', naddr.length > 90)

// NIP-27: found inside a message body, stopping cleanly at punctuation.
const body = `Can you look at nostr:${naddr}, then nostr:${addrToNaddr('30850:88ac6aae1a874652ef05e2deba8c8a9526cda0c78e6b7d98b815cd0b5a710d13:proj')}?`
const found = findNaddrs(body)
check('finds both references in a message body', found.length === 2, `${found.length} found`)
check('  …and the first still decodes', found[0] === naddr)

// Corruption must be rejected rather than silently decoded to something else.
const corrupted = `${naddr.slice(0, -1)}${naddr.at(-1) === 'q' ? 'p' : 'q'}`
let rejected = false
try {
  decodeNaddr(corrupted)
} catch {
  rejected = true
}
check('rejects a corrupted checksum', rejected)

console.log(failures === 0 ? '\nNIP-19 OK.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
