/**
 * PEEK-33 — what actually happens to a nip05 handle on the relay.
 *
 * The handle is the org's revocable attestation, so the question that matters
 * is not "can we publish one" but "can we take one away". Buzz syncs `nip05`
 * out of `kind:0` into `users.nip05_handle`, and `buzz-db/src/user.rs` only
 * touches that column when a value is present — which suggests a profile that
 * *omits* the field leaves the previous handle standing. If that is right,
 * "revoke by omission" silently fails and a leaver keeps their badge.
 *
 * This publishes a profile, reads the handle back through
 * `/.well-known/nostr.json`, then tries each plausible way of revoking it and
 * reports which actually work.
 *
 *   RELAY_URL=https://estiva.estiva.app PROBE_SECRET_KEY=<hex> \
 *     npx tsx scripts/probe-nip05.ts
 *
 * The pubkey must already be a relay member — the relay runs closed.
 */
import { publicKeyFromSecret, signEvent } from '../lib/nostr/sign'
import { Relay } from '../lib/nostr/relay'
import { secretKeySigner } from '../lib/nostr/signer'
import type { UnsignedEvent } from '../lib/nostr/events'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'
const SECRET = process.env.PROBE_SECRET_KEY
if (!SECRET) throw new Error('PROBE_SECRET_KEY is required')

const identity = { secretKeyHex: SECRET, pubkey: publicKeyFromSecret(SECRET) }
const relay = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))

/** The handle domain must equal the relay's community host, or Buzz drops it. */
const HOST = new URL(RELAY_URL).host
const LOCAL = `probe${Date.now().toString().slice(-6)}`
const HANDLE = `${LOCAL}@${HOST}`

function profile(content: Record<string, unknown>): UnsignedEvent {
  return {
    pubkey: identity.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: JSON.stringify(content),
  }
}

async function publish(label: string, content: Record<string, unknown>): Promise<void> {
  const result = await relay.publish(signEvent(profile(content), identity.secretKeyHex))
  console.log(`  publish ${label.padEnd(28)} ${result.ok ? 'accepted' : `REJECTED — ${result.reason}`}`)
}

/** Ask the relay what the handle resolves to, the way any Nostr client would. */
async function resolve(): Promise<string | null> {
  const response = await fetch(`${RELAY_URL}/.well-known/nostr.json?name=${LOCAL}`)
  const body = (await response.json()) as { names?: Record<string, string> }
  return body.names?.[LOCAL] ?? null
}

async function report(step: string): Promise<string | null> {
  // The relay syncs kind:0 asynchronously; give it a moment before reading.
  await new Promise((r) => setTimeout(r, 2000))
  const resolved = await resolve()
  const state = resolved === identity.pubkey ? 'RESOLVES to us' : resolved ? `resolves to ${resolved.slice(0, 12)}…` : 'does not resolve'
  console.log(`  → after ${step.padEnd(28)} ${state}`)
  return resolved
}

async function main(): Promise<void> {
  console.log(`relay  ${RELAY_URL}`)
  console.log(`pubkey ${identity.pubkey.slice(0, 16)}…`)
  console.log(`handle ${HANDLE}\n`)

  console.log('1. claim the handle')
  await publish('with nip05', { name: 'Handle probe', nip05: HANDLE })
  const claimed = await report('claiming')
  if (claimed !== identity.pubkey) {
    console.log('\nHandle never resolved — nothing further is meaningful.')
    return
  }

  console.log('\n2. try to revoke by OMITTING nip05 (the obvious way)')
  await publish('no nip05 field', { name: 'Handle probe' })
  const afterOmit = await report('omitting')

  console.log('\n3. try to revoke with an EMPTY nip05')
  await publish('nip05: ""', { name: 'Handle probe', nip05: '' })
  const afterEmpty = await report('empty string')

  console.log('\n--- verdict ---')
  console.log(`  omitting the field revokes:      ${afterOmit === null ? 'YES' : 'NO — handle survives'}`)
  console.log(`  empty string revokes:            ${afterEmpty === null ? 'YES' : 'NO — handle survives'}`)
  if (afterOmit !== null && afterEmpty === null) {
    console.log('\n  Offboarding must publish an EMPTY nip05, not drop the field.')
  }
}

await main()
