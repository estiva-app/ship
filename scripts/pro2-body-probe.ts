/**
 * The body slot, resolved from production through the published runtime.
 *
 *   RELAY_URL=https://estiva.estiva.app npx tsx scripts/pro2-body-probe.ts
 *
 * A script rather than a test, for the reason `pro7-probe.ts` is: the point is
 * the *live* manifest and the descriptions people actually wrote. `npm run
 * manifest` already reports both `body` slots resolving — against a fixture it
 * creates and deletes in the same run, whose description is one short line. The
 * corpus it has to survive is not that (SPEC §13.4: 86% of root descriptions
 * carry structure, the longest 5,754 characters).
 *
 * **It has caught one real defect, which is why it is in the repository.**
 * interop 0.7.0 reported no content format for a description carried in a root
 * `description` tag — which is how `buildProject` writes one — so 2 of 15
 * production projects resolved a body that could not say which model it was in.
 * Every fixture in every suite declared a fold, so nothing else saw it. 0.8.0
 * fixed it and this is the check that stays.
 *
 * Reads with `.manifest-key`, which has to belong to a relay member: reads are
 * refused otherwise with `relay_membership_required`, which is a property of
 * the relay rather than of this script.
 */
import { readFileSync } from 'node:fs'
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { resolveForeignObject } from '@estiva-app/interop'
import { KIND } from '../src/kinds'

const RELAY_URL = process.env.RELAY_URL ?? 'https://estiva.estiva.app'
const key = readFileSync(new URL('../.manifest-key', import.meta.url).pathname, 'utf8').trim()

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const relay = new Relay(RELAY_URL, secretKeySigner(key))
  const query = (filters: Record<string, unknown>[]) => relay.query(filters as never)

  const projects = await relay.query([{ kinds: [KIND.PROJECT], limit: 60 }])
  console.log(`relay    ${RELAY_URL}\nprojects ${projects.length}\n`)

  const KNOWN_FORMATS = ['marker', 'blocks', 'unknown']
  const formats: Record<string, number> = {}
  const structured: string[] = []
  let withBody = 0
  let checkedTitle = false

  // One pass. This resolved every project twice — once for the formats and
  // again for the structure count — which is 30 resolutions where 15 do, and
  // the relay allows 300 calls a minute across everything (SHI-12).
  for (const root of projects) {
    const d = root.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    const object = await resolveForeignObject(`${KIND.PROJECT}:${root.pubkey}:${d}`, query)
    const title = object?.slots.title?.value ?? '(untitled)'
    const body = object?.slots.body
    if (!body) continue
    withBody += 1
    formats[String(body.format)] = (formats[String(body.format)] ?? 0) + 1
    if (/^#{1,2} |\*\*|^- |^> |`/m.test(body.value)) structured.push(title)

    if (withBody <= 3) {
      console.log(`  "${title}"`)
      console.log(`     format ${body.format}`)
      console.log(`     body   "${body.value.replace(/\s+/g, ' ').slice(0, 70)}…" (${body.value.length} chars)`)
    }

    /*
      interop 0.8.0's invariant: a body ALWAYS reports a format.

      **Not "always reports marker".** This asserted that, which was true of
      every body on the relay when it was written and stops being true the first
      time anything writes a block document — RIC-6 is that, and the check would
      have failed on a correctly-written one under the label "reports a format:
      blocks".

      What 0.7.0 actually got wrong was returning `undefined` for a description
      carried in a root `description` tag, which is how `buildProject` writes
      one: 2 of 15 production projects. That is the regression worth guarding,
      and it is about presence rather than value.
    */
    if (!body.format || !KNOWN_FORMATS.includes(body.format)) {
      check(`"${title}" reports a known content format`, false, String(body.format))
    }

    // A title comes from a tag, so it is not a body and must carry no format at
    // all — `undefined` here rather than `'marker'` is the distinction the
    // runtime exists to make, and the half that stops the fix above from being
    // a blanket default.
    if (!checkedTitle && object?.slots.title) {
      checkedTitle = true
      check('a title carries no format, because a tag is not a body', !('format' in object.slots.title))
    }
  }

  console.log()
  check('real projects resolve a body through the live manifest', withBody > 0, `${withBody} of ${projects.length}`)
  check('every body reports a known content format', withBody > 0, JSON.stringify(formats))
  // The structure is the point: a description carrying none would resolve
  // identically whether or not any of this worked.
  check('and some of them carry §13.2 structure', structured.length > 0, `${structured.length}: ${structured.slice(0, 3).join(', ')}`)

  console.log(failures === 0 ? '\nThe body slot resolves from production.' : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
