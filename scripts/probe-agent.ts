/**
 * Can a service identity read the relay, with no person anywhere in the flow?
 *
 * Four hops, each of which can be healthy while the next one refuses, and none
 * of which can see past itself:
 *
 *   1. `POST /token` — the client-credentials grant. An app authenticates as
 *      itself and gets a short-lived token for the role identity it acts as.
 *      This is the only grant here that needs no session, because a bot has
 *      nobody to open one.
 *   2. `POST /sign` — the identity service signs a `kind:27235` NIP-98 event.
 *      This process never holds a key. The credential's `nip98_url_prefixes`
 *      decide whether the relay's own URL is an allowed destination, and a
 *      credential minted without them is refused every destination there is.
 *   3. That signed event becomes the `Authorization: Nostr …` header, which is
 *      `Relay`'s job rather than this script's.
 *   4. `POST /query` against the relay bridge, which finally returns events.
 *
 * Run it after minting a credential, after admitting a pubkey, and any time a
 * read fails for a reason nobody can name. It reports which hop broke, which is
 * the thing a single `relay_membership_required` at the end does not tell you.
 *
 *   set -a; . ~/.estiva-agent.env; set +a
 *   npx tsx scripts/probe-agent.ts
 *
 * Read-only: it publishes nothing. A credential scoped to `allowedKinds: [27235]`
 * could not publish anyway — the identity service refuses any other kind
 * server-side — which is what makes "read-only" a property of the credential
 * rather than a promise about this file.
 */
import { clientCredentialsToken, loadCredentials } from '../lib/agent/credentials'
import { Relay } from '../lib/nostr/relay'
import { estivaIdSigner } from '../lib/nostr/signer'
import { KIND } from '../src/kinds'

const RELAY_URL = (process.env.RELAY_URL ?? 'https://estiva.estiva.app').replace(/\/+$/, '')

/** What to count, and what to call it when printing. */
const FILTERS: ReadonlyArray<{ label: string; kinds: number[] }> = [
  { label: 'projects', kinds: [KIND.PROJECT] },
  { label: 'issues', kinds: [KIND.ISSUE] },
  { label: 'changes', kinds: [KIND.CHANGE] },
  { label: 'profiles', kinds: [KIND.PROFILE] },
]

async function main() {
  const credentials = loadCredentials()

  console.log(`identity  ${credentials.base}`)
  console.log(`relay     ${RELAY_URL}`)
  console.log(`client    ${credentials.clientId}\n`)

  /*
    Deliberately *not* `serviceIdentitySigner`, which would hide the token
    exchange inside the signer. This script exists to report which hop broke,
    and a wrapper that renews on failure would mask the very distinction it is
    here to draw.
  */
  const token = await clientCredentialsToken(credentials)
  console.log(`✅ token   signs as ${token.pubkey}`)

  const signer = estivaIdSigner({
    base: credentials.base,
    pubkey: token.pubkey,
    token: token.access_token,
  })
  const relay = new Relay(RELAY_URL, signer)

  let failures = 0
  let total = 0

  for (const { label, kinds } of FILTERS) {
    try {
      const events = await relay.query([{ kinds, limit: 20 }])
      total += events.length
      console.log(`✅ ${label.padEnd(9)} ${events.length}`)
    } catch (error) {
      failures++
      const message = (error as Error).message
      console.log(`❌ ${label.padEnd(9)} ${message.slice(0, 160)}`)

      /*
        The two failures that look identical from here and are not, so name them
        rather than leaving somebody to guess:

        `relay_membership_required` — the pubkey was never admitted to the
        relay. Signing worked perfectly; the door is shut. Admit it in the
        Estiva ID console, or `buzz-admin add-member`.

        `nip98_url_not_allowed` — hop 2 refused, so no header was ever built.
        Either the credential carries no `nip98_url_prefixes`, or the
        deployment's own `SIGN_NIP98_ALLOWED_URL_PREFIXES` does not cover this
        relay. The deployment list is the outer bound and the credential's
        narrows within it, so check the deployment first.
      */
      if (message.includes('relay_membership_required')) {
        console.log(`   ↳ ${token.pubkey} is not a relay member. Admission, not signing.`)
      }
      if (message.includes('nip98')) {
        console.log('   ↳ /sign refused the NIP-98 event. The credential never reached the relay.')
      }
    }
  }

  if (failures > 0) {
    console.log(`\n${failures} of ${FILTERS.length} filters failed.`)
    process.exit(1)
  }

  /*
    Zero events everywhere is not success. A relay that answers politely and
    returns nothing is indistinguishable, at the HTTP layer, from one holding
    data this identity cannot see — and the whole point of this script is to
    stop a hop reporting health it cannot actually observe.
  */
  if (total === 0) {
    console.log('\n⚠️  Every filter was accepted and every one was empty.')
    console.log('   Reading works; whether there is anything to read is unproven.')
    process.exit(1)
  }

  console.log(`\n✅ All four hops. ${total} events read from ${RELAY_URL}.`)
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error).message}`)
  process.exit(1)
})
