/**
 * NIP-19 `naddr` — bech32-encoded pointers to addressable events.
 *
 * This is how an Estiva Ship issue gets *into* another app: someone pastes
 * `nostr:naddr1…` into a Peek message (NIP-21 for the URI scheme, NIP-27 for
 * the convention of embedding one in a text body), and Peek resolves it.
 *
 * Written out rather than imported because no bech32 implementation is present
 * in this repo's dependency tree, and because a consumer needs its own copy
 * anyway — two apps that shared a decoder would be a weaker demonstration than
 * two that agree on a wire format. It is BIP-173 bech32, ~60 lines, fully
 * specified.
 *
 * **Not bech32m.** NIP-19 predates bech32m and uses the original constant
 * (`1`). Encoding with bech32m produces a string that looks right, passes a
 * casual eyeball, and fails every other implementation's checksum.
 *
 * **The 90-character limit does not apply.** BIP-173 caps a bech32 string at 90
 * characters for QR-code reasons; an `naddr` carrying a UUID `d` tag, a 32-byte
 * pubkey and a relay hint blows straight past that. NIP-19 explicitly lifts the
 * cap, so no length check appears here.
 */
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function polymod(values: number[]): number {
  let chk = 1
  for (const value of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i]
    }
  }
  return chk >>> 0
}

function hrpExpand(hrp: string): number[] {
  const high: number[] = []
  const low: number[] = []
  for (const char of hrp) {
    high.push(char.charCodeAt(0) >>> 5)
    low.push(char.charCodeAt(0) & 31)
  }
  return [...high, 0, ...low]
}

function checksum(hrp: string, data: number[]): number[] {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]
  // `^ 1` is bech32. bech32m would use `^ 0x2bc830a3` — see the note above.
  const mod = polymod(values) ^ 1
  return [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31)
}

/** Regroup bytes between bit widths, e.g. 8-bit bytes → 5-bit bech32 symbols. */
export function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const maxv = (1 << to) - 1
  for (let i = 0; i < data.length; i++) {
    const value = data[i]
    if (value < 0 || value >> from !== 0) throw new Error(`value out of range: ${value}`)
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >>> bits) & maxv)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv)
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    throw new Error('invalid padding')
  }
  return out
}

/**
 * Exported for the bare NIP-19 types (`npub`, `note`) and for tests.
 *
 * The checksum layer is the part worth testing directly: a wrong constant still
 * round-trips against itself, so only an external vector catches it.
 */
export function bech32Encode(hrp: string, data: number[]): string {
  const combined = [...data, ...checksum(hrp, data)]
  return `${hrp}1${combined.map((d) => CHARSET[d]).join('')}`
}

export function bech32Decode(encoded: string): { hrp: string; data: number[] } {
  const lower = encoded.toLowerCase()
  if (lower !== encoded && encoded.toUpperCase() !== encoded) {
    throw new Error('mixed case bech32 string')
  }
  const split = lower.lastIndexOf('1')
  if (split < 1 || split + 7 > lower.length) throw new Error('malformed bech32 string')
  const hrp = lower.slice(0, split)
  const data: number[] = []
  for (const char of lower.slice(split + 1)) {
    const index = CHARSET.indexOf(char)
    if (index === -1) throw new Error(`invalid bech32 character: ${char}`)
    data.push(index)
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('bad bech32 checksum')
  return { hrp, data: data.slice(0, -6) }
}

/** A decoded `naddr` — everything needed to fetch the event it points at. */
export interface AddressPointer {
  /** The `d` tag. */
  identifier: string
  pubkey: string
  kind: number
  /** Relay hints, in the order they appeared. May be empty. */
  relays: string[]
}

/**
 * TLV types for `naddr` (NIP-19 §"Shareable identifiers with extra metadata").
 * The numbers are the protocol; the names are ours.
 */
const TLV_IDENTIFIER = 0
const TLV_RELAY = 1
const TLV_AUTHOR = 2
const TLV_KIND = 3

export function encodeNaddr(pointer: AddressPointer): string {
  const bytes: number[] = []
  const push = (type: number, value: Uint8Array) => {
    if (value.length > 255) throw new Error(`TLV value too long for type ${type}`)
    bytes.push(type, value.length, ...value)
  }

  push(TLV_IDENTIFIER, utf8ToBytes(pointer.identifier))
  for (const relay of pointer.relays) push(TLV_RELAY, utf8ToBytes(relay))
  push(TLV_AUTHOR, hexToBytes(pointer.pubkey))
  // Kind is a 4-byte big-endian integer, not a decimal string.
  push(
    TLV_KIND,
    new Uint8Array([
      (pointer.kind >>> 24) & 0xff,
      (pointer.kind >>> 16) & 0xff,
      (pointer.kind >>> 8) & 0xff,
      pointer.kind & 0xff,
    ]),
  )

  return bech32Encode('naddr', convertBits(bytes, 8, 5, true))
}

export function decodeNaddr(encoded: string): AddressPointer {
  const { hrp, data } = bech32Decode(encoded.replace(/^nostr:/, ''))
  if (hrp !== 'naddr') throw new Error(`expected an naddr, got ${hrp}`)
  const bytes = convertBits(data, 5, 8, false)

  let identifier: string | undefined
  let pubkey: string | undefined
  let kind: number | undefined
  const relays: string[] = []

  for (let i = 0; i < bytes.length; ) {
    const type = bytes[i]
    const length = bytes[i + 1]
    const value = bytes.slice(i + 2, i + 2 + length)
    if (value.length !== length) throw new Error('truncated TLV')
    i += 2 + length

    switch (type) {
      case TLV_IDENTIFIER:
        identifier = new TextDecoder().decode(new Uint8Array(value))
        break
      case TLV_RELAY:
        relays.push(new TextDecoder().decode(new Uint8Array(value)))
        break
      case TLV_AUTHOR:
        if (length !== 32) throw new Error(`author must be 32 bytes, got ${length}`)
        pubkey = bytesToHex(new Uint8Array(value))
        break
      case TLV_KIND:
        if (length !== 4) throw new Error(`kind must be 4 bytes, got ${length}`)
        kind = ((value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3]) >>> 0
        break
      // Unknown TLV types are skipped, not rejected — that is what lets the
      // format gain fields without breaking existing decoders.
    }
  }

  if (identifier === undefined || pubkey === undefined || kind === undefined) {
    throw new Error('naddr is missing identifier, author or kind')
  }
  return { identifier, pubkey, kind, relays }
}

/** `<kind>:<pubkey>:<d>` → `naddr1…`. */
export function addrToNaddr(address: string, relays: string[] = []): string {
  const [kind, pubkey, ...rest] = address.split(':')
  return encodeNaddr({ kind: Number(kind), pubkey, identifier: rest.join(':'), relays })
}

/** `naddr1…` → `<kind>:<pubkey>:<d>`. */
export function naddrToAddr(encoded: string): string {
  const { kind, pubkey, identifier } = decodeNaddr(encoded)
  return `${kind}:${pubkey}:${identifier}`
}

/**
 * Find every `nostr:naddr1…` in a body of text.
 *
 * NIP-27's convention. The character class is bech32's own alphabet, which
 * excludes `1`, `b`, `i` and `o` — so it stops cleanly at punctuation without
 * needing a lookahead.
 */
export const NADDR_RE = /nostr:(naddr1[023456789acdefghjklmnpqrstuvwxyz]+)/gi

export function findNaddrs(text: string): string[] {
  return [...text.matchAll(NADDR_RE)].map((match) => match[1])
}
