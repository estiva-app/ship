/**
 * The signer seam (PEEK-44).
 *
 * `Store` and `Relay` now take a signer rather than a key, which is what keeps
 * this app usable by anyone with their own signer instead of only by people
 * with an Estiva account. That indirection is only worth anything if two
 * properties hold, and neither is visible at a glance:
 *
 *  1. **A signer cannot sign as somebody else.** Every implementation attributes
 *     the event to its own pubkey and ignores what the caller asked for. Without
 *     this the interface is just a function pointer.
 *  2. **The NIP-98 auth event goes through the same signer.** Buzz's bridge
 *     authenticates with NIP-98, so a keyless signer that could sign content but
 *     not auth would publish nothing — the seam would look built and not be.
 *
 *   npx tsx scripts/signer.test.ts
 */
import { schnorr } from '@noble/curves/secp256k1'
import { hexToBytes } from '@noble/hashes/utils'
import { computeEventId, type UnsignedEvent } from '@estiva-app/protocol'
import { authorizationHeader } from '@estiva-app/protocol'
import { estivaIdSigner, secretKeySigner, SignerTokenExpired } from '../lib/nostr/signer'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const SECRET = '11'.repeat(32)
const SOMEONE_ELSE = 'f'.repeat(64)
/** Whoever a misconfigured token actually belongs to. */
const A_DIFFERENT_IDENTITY = 'a1'.repeat(32)

const unsigned = (pubkey: string): UnsignedEvent => ({
  pubkey,
  created_at: 1_753_300_200,
  kind: 30851,
  tags: [['h', '22222222-2222-4222-8222-222222222222']],
  content: 'An issue.',
})

function verifies(event: { id: string; sig: string; pubkey: string }): boolean {
  try {
    return schnorr.verify(event.sig, hexToBytes(event.id), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

async function main() {
  const signer = secretKeySigner(SECRET)

  // ── The guarantee ──────────────────────────────────────────────────────────
  const honest = await signer.sign(unsigned(signer.pubkey))
  check('a signer signs its own events', honest.pubkey === signer.pubkey)
  check('  …and the signature verifies', verifies(honest))
  check('  …and the id is the hash of what was signed', honest.id === computeEventId(honest))

  // The property the whole indirection rests on: asking for someone else's
  // attribution does not get it. `/sign` makes the same promise server-side.
  const attempted = await signer.sign(unsigned(SOMEONE_ELSE))
  check('a caller cannot choose whose signature it gets', attempted.pubkey === signer.pubkey)
  check('  …and the forged pubkey is gone, not just unsigned', attempted.pubkey !== SOMEONE_ELSE)
  check('  …and the result still verifies', verifies(attempted))

  // ── NIP-98 goes through the signer ─────────────────────────────────────────
  const header = await authorizationHeader(signer, {
    url: 'http://localhost:3000/events',
    method: 'POST',
    body: '{"hello":"world"}',
  })
  check('the header carries the Nostr scheme', header.startsWith('Nostr '))

  const auth = JSON.parse(
    Buffer.from(header.slice('Nostr '.length), 'base64').toString('utf8'),
  ) as { kind: number; pubkey: string; id: string; sig: string; tags: string[][] }
  const tag = (name: string) => auth.tags.find((t) => t[0] === name)?.[1]

  check('the auth event is kind:27235', auth.kind === 27235)
  check('signed by the same signer as the content', auth.pubkey === signer.pubkey)
  check('  …and it verifies', verifies(auth))
  check('it names the URL it authorises', tag('u') === 'http://localhost:3000/events')
  check('it names the method', tag('method') === 'POST')
  check('it hashes the body', typeof tag('payload') === 'string')

  // Without a nonce, two identical requests inside the same second produce a
  // byte-identical event and the relay refuses the second as a replay. The
  // one-second resolution of `created_at` is what makes this a real hazard
  // rather than a theoretical one.
  const again = await authorizationHeader(signer, {
    url: 'http://localhost:3000/events',
    method: 'POST',
    body: '{"hello":"world"}',
  })
  check('two identical requests produce different auth events', header !== again)

  // ── The keyless implementation ─────────────────────────────────────────────
  const realFetch = globalThis.fetch
  try {
    let seen: { url: string; body: string; authorization: string } | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = {
        url,
        body: init.body as string,
        authorization: (init.headers as Record<string, string>).authorization ?? '',
      }
      return new Response(JSON.stringify({ event: { ...unsigned(SOMEONE_ELSE), id: 'x', sig: 'y' } }))
    }) as typeof fetch

    const remote = estivaIdSigner({
      base: 'https://id.estiva.app/',
      pubkey: SOMEONE_ELSE,
      token: 'a-token',
    })
    await remote.sign(unsigned(SOMEONE_ELSE))

    check('the remote signer calls /sign', seen?.url === 'https://id.estiva.app/sign')
    check('  …with the bearer token', seen?.authorization === 'Bearer a-token')
    check('  …and holds no key of its own', !JSON.stringify(seen?.body).includes(SECRET))

    /**
     * The author guard (SHA-4).
     *
     * `/sign` signs as the **token's** subject and ignores any pubkey it is
     * handed, so handing it a token belonging to somebody else does not fail —
     * it returns `200` with a perfectly valid event authored by that person. The
     * symptom arrives much later, as a comment attributed to a colleague, with
     * nothing in any log connecting it to the call that made it.
     *
     * This copy of the signer never checked. Peek's `signViaEstivaId` always did.
     * That is what three implementations of one call produce, and it landed on
     * the app that writes every issue, comment and status change.
     */
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ event: { ...unsigned(A_DIFFERENT_IDENTITY), id: 'x', sig: 'y' } }))) as typeof fetch
    let refusal: unknown
    try {
      await remote.sign(unsigned(SOMEONE_ELSE))
    } catch (error) {
      refusal = error
    }
    check(
      'refuses a 200 carrying an event by somebody else',
      refusal instanceof Error && /wrong author/.test(refusal.message),
    )
    // Not an expiry, so it must never spend a renewal: a fresh token cannot fix
    // a token that belongs to a different person.
    check('  …and does not report it as an expiry', !(refusal instanceof SignerTokenExpired))

    // A token expires every ten minutes. "Sign in again" and "that event was
    // refused" need different handling, so they are different errors.
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
    let expired = false
    try {
      await remote.sign(unsigned(SOMEONE_ELSE))
    } catch (error) {
      expired = error instanceof SignerTokenExpired
    }
    check('an expired token is distinguishable from a refusal', expired)

    /**
     * Renewal (PEEK-108). Access tokens live ten minutes, so any session of
     * real length crosses an expiry — and `SignerTokenExpired` has never had a
     * handler in the app, so without this a signature would simply fail.
     */
    let attempts = 0
    let lastAuth = ''
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      attempts++
      lastAuth = (init.headers as Record<string, string>).authorization ?? ''
      // First call: the held token is expired. After renewal it is accepted.
      if (lastAuth === 'Bearer stale') return new Response('{}', { status: 401 })
      /*
        The author has to be right, not just present. This used to answer
        `{ event: { id: 'ok' } }`, which no real `/sign` ever returns — and it
        passed only because this signer did not check who signed. SHA-4 moved the
        signer into `@estiva-app/identity` with the guard Peek always had, and
        this fixture is the first thing it caught.
      */
      return new Response(
        JSON.stringify({ event: { ...unsigned(SOMEONE_ELSE), id: 'ok', sig: 'ok' } }),
        { status: 200 },
      )
    }) as typeof fetch

    let renewals = 0
    const renewing = estivaIdSigner({
      base: 'https://id.estiva.app/',
      pubkey: SOMEONE_ELSE,
      token: 'stale',
      renew: async () => {
        renewals++
        return 'fresh'
      },
    })
    await renewing.sign(unsigned(SOMEONE_ELSE))
    check('a 401 renews the token and retries', renewals === 1 && attempts === 2)
    check('  …and the retry carries the new token', lastAuth === 'Bearer fresh')

    // A later signature uses the renewed token rather than retrying the dead
    // one, or every subsequent call would cost two round trips and a renewal.
    attempts = 0
    await renewing.sign(unsigned(SOMEONE_ELSE))
    check('the renewed token is kept for later signatures', attempts === 1)

    /**
     * A second 401 after a successful renewal is not an expiry — it is a token
     * the service will not accept. Retrying that in a loop is how one refused
     * signature becomes a hot loop against the identity service.
     */
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
    let renewAttempts = 0
    const stubborn = estivaIdSigner({
      base: 'https://id.estiva.app/',
      pubkey: SOMEONE_ELSE,
      token: 'stale',
      renew: async () => {
        renewAttempts++
        return 'also-rejected'
      },
    })
    let stillExpired = false
    try {
      await stubborn.sign(unsigned(SOMEONE_ELSE))
    } catch (error) {
      stillExpired = error instanceof SignerTokenExpired
    }
    check('renewal is attempted once, never in a loop', renewAttempts === 1 && stillExpired)

    // No renewer configured is the old behaviour, unchanged.
    let withoutRenew = false
    const plain = estivaIdSigner({
      base: 'https://id.estiva.app/',
      pubkey: SOMEONE_ELSE,
      token: 'stale',
    })
    try {
      await plain.sign(unsigned(SOMEONE_ELSE))
    } catch (error) {
      withoutRenew = error instanceof SignerTokenExpired
    }
    check('without a renewer, an expiry still surfaces', withoutRenew)
  } finally {
    globalThis.fetch = realFetch
  }

  console.log(failures === 0 ? '\nSigner seam OK.' : `\n${failures} check(s) failed.`)
  if (failures > 0) process.exit(1)
}

await main()
