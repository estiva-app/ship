/**
 * The ten-minute question, asked in real time.
 *
 * `scripts/agent-signer.test.ts` forces the renewal path in seconds by starting
 * from a token that was never valid, and that is the guard worth running often.
 * It cannot answer one thing: whether a token this process obtained legitimately
 * actually stops being accepted when the service says it will, and whether the
 * renewal fires *then*. A wrong `expires_in`, a clock skew, a service that
 * revokes early — all of those look identical to a passing forced test and show
 * up as a job that dies twelve minutes in.
 *
 * So this one waits. It reads on a slow loop until the token it started with has
 * outlived its stated lifetime, and reports whether a renewal happened and
 * whether reads kept working across it.
 *
 *   set -a; . ~/.estiva-agent.env; set +a
 *   npx tsx scripts/agent-renewal-soak.ts
 *
 * Minutes, not seconds — run it when changing anything about tokens, not on
 * every commit. Read-only throughout.
 */
import { loadCredentials, clientCredentialsToken, serviceIdentitySigner } from '../lib/agent/credentials'
import { Relay } from '../lib/nostr/relay'
import { KIND } from '../src/kinds'

const RELAY_URL = (process.env.RELAY_URL ?? 'https://estiva.estiva.app').replace(/\/+$/, '')

/** How long past the stated expiry to keep going, so the boundary is crossed. */
const MARGIN_SECONDS = 90
const INTERVAL_SECONDS = 60

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))
const stamp = () => new Date().toISOString().slice(11, 19)

async function main() {
  const credentials = loadCredentials()

  // Asked once up front so the run length comes from the service rather than a
  // number written here that could drift away from it silently.
  const { expires_in } = await clientCredentialsToken(credentials)
  const ttl = expires_in ?? 600
  const runFor = ttl + MARGIN_SECONDS

  console.log(`identity   ${credentials.base}`)
  console.log(`relay      ${RELAY_URL}`)
  console.log(`token TTL  ${ttl}s — running for ${runFor}s\n`)

  let renewals = 0
  let failedRenewals = 0
  const signer = await serviceIdentitySigner(credentials, {
    onRenew: (ok) => {
      if (ok) renewals++
      else failedRenewals++
      console.log(`${stamp()}  ↻ renewal ${ok ? 'succeeded' : 'FAILED'}`)
    },
  })
  const relay = new Relay(RELAY_URL, signer)

  const startedAt = Date.now()
  let reads = 0
  let failures = 0

  while ((Date.now() - startedAt) / 1000 < runFor) {
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    try {
      const events = await relay.query([{ kinds: [KIND.PROJECT], limit: 5 }])
      reads++
      console.log(`${stamp()}  +${String(elapsed).padStart(4)}s  ${events.length} projects`)
    } catch (error) {
      failures++
      console.log(`${stamp()}  +${String(elapsed).padStart(4)}s  ❌ ${(error as Error).message.slice(0, 120)}`)
    }
    await sleep(INTERVAL_SECONDS)
  }

  console.log(`\n${reads} reads, ${failures} failures, ${renewals} renewals`)

  /*
    Zero renewals is a failure, not a clean run. It means the token outlived its
    own `expires_in` — so either the service is not enforcing what it advertises,
    or this loop never actually crossed the boundary. Both make the renewal path
    untested while looking green, which is the outcome this script exists to
    refuse.
  */
  if (failures > 0 || failedRenewals > 0) {
    console.log('❌ Reads failed across the TTL boundary.')
    process.exit(1)
  }
  if (renewals === 0) {
    console.log('⚠️  No renewal ever fired — the boundary was not crossed, so nothing was proven.')
    process.exit(1)
  }

  console.log('✅ Reads survived the token expiring, and the renewal was observed.')
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error).message}`)
  process.exit(1)
})
