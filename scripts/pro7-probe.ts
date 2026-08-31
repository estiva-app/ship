/**
 * Ship resolving a Peek object from production, through the vendored runtime.
 *
 * A script rather than a test because the point is the *live* relay: the
 * manifest is discovered by `#k`, and a fixture proving discovery would be
 * proving something nobody doubted.
 */
import { Relay } from '@estiva-app/protocol'
import { clientCredentialsToken, loadCredentials } from '/home/miky/estiva-agent/lib/agent/credentials'
import { estivaIdSigner } from '/home/miky/estiva-agent/lib/nostr/signer'
import { resolveForeignObject } from '../interop/projection'

const c = loadCredentials()
const t = await clientCredentialsToken(c)
const relay = new Relay('https://estiva.estiva.app', estivaIdSigner({ base: c.base, pubkey: t.pubkey, token: t.access_token }))
const query = (f: Record<string, unknown>[]) => relay.query(f as never)

const topics = await relay.query([{ kinds: [39000], limit: 30 }])
let shown = 0
for (const tp of topics) {
  const d = tp.tags.find((x) => x[0] === 'd')?.[1] ?? ''
  const obj = await resolveForeignObject(`39000:${tp.pubkey}:${d}`, query as never)
  if (!obj?.children?.length) continue
  shown++
  console.log(`\nSHIP RESOLVED A PEEK OBJECT`)
  console.log(`  app       ${obj.appName}`)
  console.log(`  title     ${obj.slots.title?.value}`)
  console.log(`  widget    ${JSON.stringify(obj.widget)}`)
  console.log(`  children  ${obj.children.length}`)
  const ch = obj.children[0]
  console.log(`  first child:`)
  console.log(`    widget      ${JSON.stringify(ch.widget)}   (chain, unrenderable as a closed type alone)`)
  console.log(`    addressable ${!!ch.address}`)
  console.log(`    author      ${obj.people?.[ch.slots.title?.value ?? '']?.displayName ?? '(nobody published a kind:0)'}`)
  console.log(`    body        "${(ch.slots.body?.value ?? '').replace(/\s+/g, ' ').slice(0, 60)}…"`)
  /*
    The relay-signed author, which this ticket names as something Ship has never
    had to attribute.

    A kind:39000 is signed by the *relay*, so "who wrote this" is the relay's
    pubkey rather than a person's. Peek's manifest declares no author slot for a
    Topic — title comes from the `name` tag — so the relay never reaches a
    renderer as a person. Asserted rather than assumed, because the failure would
    be a card attributed to a machine and nothing would report it.
  */
  const topicAuthorRendered = Object.values(obj.slots).some((s) => s.isPubkey)
  console.log(`  topic renders its (relay) author as a person? ${topicAuthorRendered}  — must be false`)
  if (topicAuthorRendered) process.exit(1)
  if (shown >= 1) break
}
if (!shown) { console.log('no topic with messages resolved'); process.exit(1) }
