/**
 * Does the service-identity signer really renew, or does it only look like it?
 *
 * The renewal path is the kind of code that is easy to write, impossible to
 * notice is broken, and only fails after ten minutes of successful work — which
 * is to say, in front of somebody who has stopped watching. `SignerTokenExpired`
 * shipped on the browser side with no handler at all and stayed that way until
 * PEEK-108, for exactly this reason.
 *
 * So the interesting test is not "does it sign" but **"does it sign after the
 * token it started with has stopped working"**. Waiting ten real minutes proves
 * that too, and `scripts/agent-renewal-soak.ts` does, but a test nobody will run
 * is not a guard. This forces the same code path in seconds by starting from a
 * token that was never valid: `/sign` answers 401, `renew` fires, and the retry
 * has to succeed.
 *
 *   set -a; . ~/.estiva-agent.env; set +a
 *   npx tsx scripts/agent-signer.test.ts
 *
 * Talks to the live identity service, deliberately — the thing under test is an
 * agreement with a remote service about a status code, and a stubbed 401 would
 * only prove this file agrees with itself.
 *
 * Signs a NIP-98 event, which travels no further than this process. Nothing is
 * published, and the credential could not publish if it tried.
 */
import { clientCredentialsToken, loadCredentials, serviceIdentitySigner } from '../lib/agent/credentials'
import { estivaIdSigner, SignerTokenExpired } from '../lib/nostr/signer'

const RELAY_URL = process.env.RELAY_URL ?? 'https://estiva.estiva.app'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

/** A NIP-98 event for the relay bridge — the one kind a read-only bot may sign. */
const httpAuth = () => ({
  pubkey: '',
  created_at: Math.floor(Date.now() / 1000),
  kind: 27235,
  tags: [
    ['u', `${RELAY_URL}/query`],
    ['method', 'POST'],
    // Unique per event: the relay records auth event ids in a replay set, and
    // `created_at` is only second-resolution, so two otherwise identical events
    // in the same second collide.
    ['nonce', Math.random().toString(36).slice(2)],
  ],
  content: '',
})

async function main() {
  const credentials = loadCredentials()
  console.log(`identity  ${credentials.base}`)
  console.log(`client    ${credentials.clientId}\n`)

  // A real signer signs. Table stakes, but it separates "renewal is broken"
  // from "nothing works" when this file starts failing.
  const signer = await serviceIdentitySigner(credentials)
  const signed = await signer.sign({ ...httpAuth(), pubkey: signer.pubkey })
  check('signs with a freshly obtained token', signed.sig.length === 128, `kind:${signed.kind}`)
  check('signs as the identity the token names', signed.pubkey === signer.pubkey)

  /**
   * The one that matters.
   *
   * Starting from a token the service will never accept makes the first `/sign`
   * fail with 401 exactly as an expired one does. If `renew` is wired up, the
   * signature still comes back; if it is not, this throws `SignerTokenExpired`
   * and that is the ten-minute bug, found in two seconds.
   */
  let renewals = 0
  const renewing = estivaIdSigner({
    base: credentials.base,
    pubkey: signer.pubkey,
    token: 'not-a-token-and-never-was',
    renew: async () => {
      renewals++
      return (await clientCredentialsToken(credentials)).access_token
    },
  })

  const afterRenewal = await renewing.sign({ ...httpAuth(), pubkey: signer.pubkey })
  check('renews a dead token and completes the signature', afterRenewal.sig.length === 128)
  check('renewed exactly once', renewals === 1, `${renewals} renewal(s)`)

  /**
   * And the failure that must stay a failure.
   *
   * A renewal that returns a token the service still refuses is not an expiry
   * to retry — it is a broken credential, and looping on it turns one refused
   * signature into a hot loop against the identity service. One retry, then the
   * error.
   */
  let hopeless = 0
  const stubborn = estivaIdSigner({
    base: credentials.base,
    pubkey: signer.pubkey,
    token: 'not-a-token-and-never-was',
    renew: async () => {
      hopeless++
      return 'still-not-a-token'
    },
  })

  try {
    await stubborn.sign({ ...httpAuth(), pubkey: signer.pubkey })
    check('gives up when renewal cannot help', false, 'it signed, which it must not')
  } catch (error) {
    check('gives up when renewal cannot help', error instanceof SignerTokenExpired)
    check('does not retry in a loop', hopeless === 1, `${hopeless} attempt(s)`)
  }

  console.log(failures === 0 ? '\nAll signer checks passed.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error).message}`)
  process.exit(1)
})
