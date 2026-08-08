/**
 * Ask the live relay, one kind at a time, "would you accept this?".
 *
 * Run before and after patching Buzz. Before, every Estiva Ship kind should come
 * back `restricted: unknown event kind`; after, every one should be accepted.
 * The point is to have the relay's own words rather than an assumption about
 * what the allowlist contains.
 *
 *   npx tsx scripts/probe-kinds.ts
 *
 * Publishes into a throwaway Folder created by this script, so it is safe to run
 * repeatedly against a dev relay.
 */
import { randomUUID } from 'node:crypto'
import { buildCreateChannel, type NostrTag, type UnsignedEvent } from '../lib/nostr/events'
import { signEvent, publicKeyFromSecret } from '../lib/nostr/sign'
import { Relay } from '../lib/nostr/relay'
import { secretKeySigner } from '../lib/nostr/signer'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'

/**
 * A fresh throwaway key per run — these are props, not products.
 *
 * `PROBE_SECRET_KEY` overrides it, which is what makes this usable against a
 * relay running closed (`BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`). There the author
 * must already be a member, and a key invented at runtime can never be one:
 *
 *   buzz-admin add-member <pubkey>
 *   PROBE_SECRET_KEY=<hex> RELAY_URL=https://<relay> npx tsx scripts/probe-kinds.ts
 *   buzz-admin remove-member <pubkey>
 *
 * Still a throwaway — admit it for the run and remove it afterwards rather than
 * leaving a standing member that exists only to run tests.
 */
function newIdentity() {
  const fromEnv = process.env.PROBE_SECRET_KEY?.trim()
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) {
      throw new Error('PROBE_SECRET_KEY must be 64 hex characters')
    }
    return { secretKeyHex: fromEnv.toLowerCase(), pubkey: publicKeyFromSecret(fromEnv.toLowerCase()) }
  }
  const secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  return { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
}

const identity = newIdentity()
const relay = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))
const folder = randomUUID() // `h_grammar: uuid-v4-lowercase` per the relay's NIP-11

function unsigned(kind: number, tags: NostrTag[], content = ''): UnsignedEvent {
  return {
    pubkey: identity.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
  }
}

async function probe(label: string, event: UnsignedEvent): Promise<boolean> {
  const result = await relay.publish(signEvent(event, identity.secretKeyHex))
  const mark = result.ok ? '✅' : '❌'
  const detail = result.reason ? ` — ${result.reason}` : ''
  console.log(`${mark} ${label.padEnd(34)}${result.ok ? 'accepted' : 'REJECTED'}${detail}`)
  return result.ok
}

async function main() {
  console.log(`relay  ${RELAY_URL}`)
  console.log(`folder ${folder}`)
  console.log(`author ${identity.pubkey.slice(0, 16)}…\n`)

  // FRICTION.md A4: ordering is enforced. A channel-scoped event into a channel
  // the relay does not know is rejected as "not a channel member", which looks
  // like a permission problem and is really a missing container. So the Folder
  // has to exist before anything can be published into it.
  const created = await probe(
    'kind:9007 Folder (precondition)',
    buildCreateChannel(identity.pubkey, Date.now(), {
      channelUuid: folder,
      name: `probe-${folder.slice(0, 8)}`,
      visibility: 'private',
    }),
  )
  if (!created) {
    console.error('\nFolder creation failed — nothing below would be meaningful. Stopping.')
    process.exit(1)
  }
  console.log('')

  const issueD = randomUUID()
  const projectD = randomUUID()
  const projectAddr = `30850:${identity.pubkey}:${projectD}`
  const issueAddr = `30851:${identity.pubkey}:${issueD}`

  const results = [
    // ── Ratified NIPs Buzz has not adopted ──
    await probe(
      'kind:1111 NIP-22 comment',
      unsigned(
        1111,
        [
          ['A', issueAddr],
          ['K', '30851'],
          ['P', identity.pubkey],
          ['a', issueAddr],
          ['k', '30851'],
          ['p', identity.pubkey],
          ['h', folder],
        ],
        'a comment on an issue',
      ),
    ),
    // `k` is deliberately a kind nobody handles. NIP-89 discovery is a `#k`
    // query, so a probe claiming `k=30851` makes itself a competing handler for
    // real issues — which happened, and briefly turned spec §7.3 ("which
    // manifest wins?") from an open question into a live one. A probe should
    // test that the kind is accepted without joining the registry.
    await probe(
      'kind:31990 NIP-89 handler info',
      unsigned(31990, [['d', 'ship-probe'], ['k', '65535']], '{"name":"probe"}'),
    ),
    await probe(
      'kind:31989 NIP-89 recommendation',
      unsigned(31989, [['d', '65535'], ['a', `31990:${identity.pubkey}:ship-probe`]]),
    ),

    // ── Ship's own provisional kinds ──
    await probe(
      'kind:30850 Project',
      unsigned(
        30850,
        [['d', projectD], ['title', 'Payment integration'], ['h', folder]],
        'Stripe Checkout for workspace billing.',
      ),
    ),
    await probe(
      'kind:30851 Issue',
      unsigned(
        30851,
        [
          ['d', issueD],
          ['title', 'Billing entry + add payment method'],
          ['h', folder],
          ['a', projectAddr],
          ['ref', 'PEE-127'],
        ],
        'Entry point in settings.',
      ),
    ),
    await probe(
      'kind:1851 Change',
      unsigned(1851, [
        ['a', issueAddr],
        ['field', 'status'],
        ['value', 'in_progress'],
        ['h', folder],
      ]),
    ),
  ]

  // The Folder is required on every Ship object (RFC_UPDATES §1.1). Prove
  // the relay enforces that rather than trusting clients to remember.
  console.log('\nFolder enforcement — these SHOULD be rejected:')
  const hless = [
    await probe('kind:30851 Issue, no h tag', unsigned(30851, [['d', randomUUID()], ['title', 'orphan']])),
    await probe('kind:1851 Change, no h tag', unsigned(1851, [['a', issueAddr], ['field', 'status'], ['value', 'done']])),
  ]

  const accepted = results.filter(Boolean).length
  console.log(`\n${accepted}/${results.length} kinds accepted.`)
  console.log(`${hless.filter((ok) => !ok).length}/${hless.length} h-less objects correctly rejected.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
