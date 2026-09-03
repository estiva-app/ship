/**
 * A pasted URL, resolved against production — RFC 0.5 §7.5, PRO-15.
 *
 *   RELAY_URL=https://estiva.estiva.app npx tsx scripts/pro15-probe.ts
 *
 * The mechanism a consumer uses, with nothing app-specific in it: read every
 * published manifest, match the link against the shapes they declare, then one
 * `#d` query. No index, no registry, no per-app integration.
 */
import { readFileSync } from 'node:fs'
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { matchObjectUrl, urlPatternsOf } from '@estiva-app/interop'

const key = readFileSync(new URL('../.manifest-key', import.meta.url).pathname, 'utf8').trim()
const relay = new Relay(process.env.RELAY_URL ?? 'https://estiva.estiva.app', secretKeySigner(key))
const tag = (e: { tags: string[][] }, n: string) => e.tags.find((t) => t[0] === n)?.[1]

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// Every manifest anybody has published. This is the whole registry.
const manifests = await relay.query([{ kinds: [31990], limit: 50 }] as never)
const shapes = manifests.flatMap((m) => urlPatternsOf(m))
console.log(`manifests ${manifests.length}, declared URL shapes ${shapes.length}\n`)
for (const s of shapes) console.log(`   ${s.pattern}${s.kind ? `  → ${s.kind}` : ''}`)

/** A consumer's whole job: match, then one query. */
async function resolvePasted(url: string) {
  const hit = matchObjectUrl(url, shapes)
  if (!hit) return null
  const filter: Record<string, unknown> = { '#d': [hit.identifier], limit: 2 }
  if (hit.kind) filter.kinds = [hit.kind]
  const found = await relay.query([filter] as never)
  return { hit, found }
}

// A real Ship issue, addressed the way its own address bar now does.
const issues = await relay.query([{ kinds: [30851], limit: 40 }] as never)
const real = issues.find((i) => tag(i, 'title') && tag(i, 'd'))!
const d = tag(real, 'd')!
const slug = String(tag(real, 'title')).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
const pasted = `https://ship.estiva.app/issue/${slug}-${d}`
console.log(`\npasted: ${pasted.slice(0, 96)}…`)

const resolved = await resolvePasted(pasted)
check('a pasted Ship URL matches a declared shape', !!resolved, resolved ? `kind ${resolved.hit.kind}` : 'no match')
check('  …and one #d query returns exactly one event', resolved?.found.length === 1, `${resolved?.found.length} event(s)`)
check('  …which is the object the link named', resolved?.found[0]?.id === real.id, String(tag(resolved?.found[0] ?? real, 'title')).slice(0, 46))

// The old shape, still in other people's messages.
const old = await resolvePasted(`https://ship.estiva.app/#/issue/${d}`)
check('a link published before SHI-16 still resolves', old?.found.length === 1)

// And the refusal that matters.
const evil = await resolvePasted(`https://evil.example.com/issue/x-${d}`)
check('another host resolves to nothing', evil === null)

console.log(failures === 0 ? '\nA pasted URL resolves from production.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
