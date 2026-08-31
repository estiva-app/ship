/**
 * Ship resolving a Peek object from production, through the vendored runtime.
 *
 *   PROBE_SECRET_KEY=<64 hex> RELAY_URL=https://estiva.estiva.app \
 *     npx tsx scripts/pro7-probe.ts
 *
 * A script rather than a test because the point is the *live* relay: the
 * manifest is discovered by a `#k` query, and a fixture proving discovery would
 * be proving something nobody doubted.
 *
 * ## It imports nothing outside this repository, and that is the fix
 *
 * The first version imported the agent's credential helper by absolute path —
 * `/home/miky/estiva-agent/lib/...` — which typechecks on exactly one machine
 * and failed CI immediately. That is the same defect PRO-1 removed from Peek's
 * `verify-foreign-render.ts` a few hours earlier, reintroduced here by the
 * person who removed it.
 *
 * Worth stating why it is a real defect rather than an inconvenience: a script
 * that cannot run anywhere else is not a check, it is a note about somebody's
 * laptop. So this signs with Ship's own `secretKeySigner` and takes the key
 * from the environment.
 *
 * The key has to belong to a **relay member** — reads are refused otherwise
 * with `relay_membership_required`, which is a property of the relay and not of
 * this script. Ship's gitignored `.manifest-key` is one, and is the default.
 */
import { readFileSync, existsSync } from 'node:fs'
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { resolveForeignObject } from '../interop/projection'

const RELAY_URL = process.env.RELAY_URL ?? 'https://estiva.estiva.app'
const KEY_FILE = new URL('../.manifest-key', import.meta.url).pathname

function secretKey(): string {
  const fromEnv = process.env.PROBE_SECRET_KEY?.trim()
  if (fromEnv && /^[0-9a-f]{64}$/.test(fromEnv)) return fromEnv
  if (existsSync(KEY_FILE)) {
    const onDisk = readFileSync(KEY_FILE, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(onDisk)) return onDisk
  }
  console.error(
    '\n✋ No key to read with.\n' +
      '   Set PROBE_SECRET_KEY to 64 hex chars, or put one in .manifest-key.\n' +
      '   It must belong to a relay member; anything else is refused with\n' +
      '   relay_membership_required before any filter is considered.\n',
  )
  process.exit(1)
}

async function main() {
  const relay = new Relay(RELAY_URL, secretKeySigner(secretKey()))
  const query = (filters: Record<string, unknown>[]) => relay.query(filters as never)

  const topics = await relay.query([{ kinds: [39000], limit: 30 }])
  console.log(`relay  ${RELAY_URL}\ntopics ${topics.length}\n`)

  for (const topic of topics) {
    const d = topic.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    const object = await resolveForeignObject(`39000:${topic.pubkey}:${d}`, query)
    if (!object?.children?.length) continue

    console.log('SHIP RESOLVED A PEEK OBJECT')
    console.log(`  app       ${object.appName}`)
    console.log(`  title     ${object.slots.title?.value}`)
    console.log(`  widget    ${JSON.stringify(object.widget)}`)
    console.log(`  children  ${object.children.length}`)

    const child = object.children[0]
    const author = child.slots.title?.value ?? ''
    console.log('  first child:')
    console.log(`    widget      ${JSON.stringify(child.widget)}   (a chain — no consumer walks one yet)`)
    console.log(`    addressable ${!!child.address}`)
    console.log(`    author      ${object.people?.[author]?.displayName ?? '(nobody published a kind:0)'}`)
    console.log(`    body        "${(child.slots.body?.value ?? '').replace(/\s+/g, ' ').slice(0, 60)}…"`)

    /*
      The relay-signed author, which PRO-7 names as something Ship has never had
      to attribute.

      A kind:39000 is signed by the *relay*, so "who wrote this" is a machine
      rather than a person. Peek's manifest declares no author slot for a Topic
      — the title comes from the `name` tag — so the relay never reaches a
      renderer as somebody. Asserted rather than assumed, because the failure is
      a card attributed to a relay and nothing else would report it.
    */
    const attributesRelay = Object.values(object.slots).some((slot) => slot.isPubkey)
    console.log(`  topic attributes its (relay) author as a person? ${attributesRelay} — must be false`)
    process.exit(attributesRelay ? 1 : 0)
  }

  console.error('no topic with messages resolved — nothing was verified')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
