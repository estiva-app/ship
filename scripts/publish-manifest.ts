/**
 * Publish Estiva Ship's NIP-89 manifest, then read it back and check it.
 *
 * Build-order step 3: "Still no consumer; just an event." So the check here is
 * deliberately the consumer's check — resolve the manifest the way Peek will
 * (query `kind:31990` filtered by `#k`), then confirm every projection it
 * declares can actually be satisfied by a real object.
 *
 * That last part is the one worth having. A manifest that references a tag the
 * events do not carry is still valid JSON and still publishes fine; it fails
 * only in the consumer, days later, as an empty widget.
 *
 *   npx tsx scripts/publish-manifest.ts
 *
 * Identity: reuses `.manifest-key` so republishing replaces the same
 * addressable event rather than creating a second competing manifest.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../src/nostr/signer'
import { publicKeyFromSecret, signEvent } from '@estiva-app/protocol'
import {
  buildManifest,
  DEFAULT_APP_URL,
  MANIFEST_D_TAG,
  manifestContent,
  resolveSlotValue as resolveSlot,
  type ManifestContent,
  type SlotSource,
} from '../src/nostr/manifest'
import { Store } from '../src/nostr/store'
import { buildDeletion as buildEventDeletion } from '@estiva-app/protocol'
import { KIND } from '../src/nostr/kinds'
import { widgetChainProblem, CLOSED_WIDGETS } from '@estiva-app/interop'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'
const KEY_FILE = new URL('../.manifest-key', import.meta.url).pathname

/**
 * A stable identity for the manifest.
 *
 * NIP-33 addresses are `(pubkey, kind, d)`, so a fresh key every run would
 * publish a *new* manifest each time rather than replacing the old one, and a
 * consumer filtering on `#k` would find several and have to pick. Keeping the
 * key on disk is what makes "publish again" mean "update".
 */
function manifestIdentity() {
  let secretKeyHex = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : ''
  if (!/^[0-9a-f]{64}$/.test(secretKeyHex)) {
    secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
    writeFileSync(KEY_FILE, `${secretKeyHex}\n`, { mode: 0o600 })
    console.log('generated a new manifest key → .manifest-key (gitignored)')
  }
  return { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
}

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

/** Resolve a slot against a real event the way a consumer would. */
/**
 * Refuse to publish a production manifest that points at a laptop.
 *
 * `APP_URL` and `RELAY_URL` both default to localhost, and only one of them is
 * obvious when it is wrong. A run against the production relay with the default
 * app URL publishes a manifest whose every "open in Ship" link is
 * `http://localhost:5190/…` — which is what happened on 2026-08-25: two
 * republishes, every check green, and the links in Peek's widget pointed at a
 * machine nobody else has. The failing check is not the mechanism; there is no
 * failing check, because from the script's point of view a localhost app URL is
 * a perfectly valid string.
 *
 * So the pairing is asserted before anything is signed. A local relay with a
 * local app is fine; a remote relay with a local app is a mistake every time.
 */
function assertUrlsAgree(relayUrl: string, appUrl: string): void {
  const local = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)
  if (!local(relayUrl) && local(appUrl)) {
    console.error(
      `\n✋ Refusing to publish.\n` +
        `   relay is ${relayUrl} but the app URL is ${appUrl}.\n` +
        `   Every "open in Ship" link in the manifest would point at localhost.\n` +
        `   Publishing to production:\n` +
        `     APP_URL=https://ship.estiva.app/ RELAY_URL=https://estiva.estiva.app npm run manifest\n`,
    )
    process.exit(1)
  }
}


/**
 * Resolve a `list` slot the way a consumer will, and say what came back.
 *
 * This is the check the script exists for, applied to the one slot that cannot
 * be answered from the root event. A `list` naming a kind nothing writes, or a
 * `via` tag no child carries, is still valid JSON and still publishes fine — it
 * fails in the consumer, later, as a project card with nothing underneath,
 * which is indistinguishable from a project that genuinely has no issues.
 */
async function checkListSlot(
  relay: Relay,
  slot: Extract<SlotSource, { children: unknown }>,
  parentAddress: string,
  expectedChildAddress: string,
): Promise<void> {
  const { kind, via, limit } = slot.children
  const children = await relay.query([{ kinds: [kind], [`#${via}`]: [parentAddress], limit: limit ?? 200 }])
  check(
    `list slot resolves children by #${via} → kind:${kind}`,
    children.length > 0,
    `${children.length} child(ren) of ${parentAddress.slice(0, 24)}…`,
  )
  // Named, not merely counted. A non-empty answer to the wrong query is the
  // failure this is here to catch, and a count alone cannot tell them apart.
  const ids = children.map((e) => {
    const d = e.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    return `${e.kind}:${e.pubkey}:${d}`
  })
  check(
    '  …and the issue just published is among them',
    ids.includes(expectedChildAddress),
    expectedChildAddress.slice(0, 32) + '…',
  )
}

async function main() {
  const identity = manifestIdentity()
  const relay = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))

  console.log(`relay    ${RELAY_URL}`)
  console.log(`manifest ${identity.pubkey.slice(0, 16)}…  (31990:<pubkey>:${MANIFEST_D_TAG})\n`)

  // Overridable so a deployment somewhere other than the dev port publishes a
  // `web` tag that actually resolves for whoever follows it.
  assertUrlsAgree(RELAY_URL, process.env.APP_URL ?? DEFAULT_APP_URL)

  /*
    Every widget declaration is publishable — PRO-3, and the same check Peek's
    publish script runs, from the same function.

    Ship's own `Projection.widget` is the closed union, so today the compiler
    already makes a bad value unwritable here and this cannot fail. It is worth
    running anyway for two reasons: the thing being checked is the *published
    JSON*, which is what another app reads and what the type stops describing
    the moment the union is widened to allow a chain; and one implementation
    checking both producers is what stops the rule drifting between them, which
    is the same argument that put `CLOSED_WIDGETS` in the runtime rather than in
    each app.
  */
  for (const [kind, projection] of Object.entries(manifestContent().projections)) {
    const problem = widgetChainProblem(projection.widget)
    if (problem) {
      console.error(`\n✋ Refusing to publish. kind:${kind} — ${problem}\n`)
      process.exit(1)
    }
  }
  check('every widget chain terminates in a closed type', true, CLOSED_WIDGETS.join(', '))

  const event = buildManifest(identity.pubkey, Date.now(), process.env.APP_URL)
  const published = await relay.publish(signEvent(event, identity.secretKeyHex))
  check('the relay accepts kind:31990', published.ok, published.reason ?? '')
  if (!published.ok) process.exit(1)

  // The browser app has to know its own manifest address in order to recommend
  // it (kind:31989), and it cannot read `.manifest-key`. Written out as a
  // committed generated module so the built bundle carries it.
  writeFileSync(
    new URL('../src/nostr/manifest-address.ts', import.meta.url).pathname,
    `/**\n * Generated by \`npm run manifest\`. Do not edit by hand.\n *\n * The address of the manifest this build recommends. Ship publishes a\n * kind:31989 pointing here on the user's behalf, which is how a consumer picks\n * this manifest over any other claiming the same kinds.\n */\nexport const MANIFEST_ADDRESS = '31990:${identity.pubkey}:${MANIFEST_D_TAG}'\n`,
  )
  console.log('   wrote src/manifest-address.ts')

  // ── Resolve it the way a consumer will ────────────────────────────────────
  // Peek will not know Ship's pubkey. It will hold an object of some
  // kind and ask "who handles this?" — which is a `#k` filter, NIP-89's own
  // discovery mechanism.
  for (const kind of [KIND.PROJECT, KIND.ISSUE]) {
    const found = await relay.query([{ kinds: [31990], '#k': [String(kind)], limit: 20 }])
    check(
      `a consumer holding a kind:${kind} finds a handler by #k`,
      found.some((e) => e.pubkey === identity.pubkey),
      `${found.length} manifest(s) declare kind ${kind}`,
    )
  }

  const [stored] = await relay.query([
    { kinds: [31990], authors: [identity.pubkey], '#d': [MANIFEST_D_TAG], limit: 1 },
  ])
  check('the manifest reads back', !!stored)
  if (!stored) process.exit(1)

  let manifest: ManifestContent
  try {
    manifest = JSON.parse(stored.content)
  } catch (error) {
    check('the manifest content is valid JSON', false, (error as Error).message)
    process.exit(1)
  }

  check('it declares how to fold a record', manifest.records?.changeKind === KIND.CHANGE, `changeKind=${manifest.records?.changeKind}`)
  check('it declares the ordering rule', Array.isArray(manifest.records?.order) && manifest.records.order[0] === 'ts', manifest.records?.order?.join(' → '))

  // Every action this build declares, read back off the relay rather than off
  // the event we signed — the relay's copy is the only one a consumer sees.
  const storedIds = new Set((manifest.actions as { id?: string }[]).map((a) => a.id))
  const missingActions = (manifestContent().actions as { id: string }[]).map((a) => a.id).filter((id) => !storedIds.has(id))
  check('every declared action reads back', missingActions.length === 0, missingActions.join(', ') || [...storedIds].join(', '))

  // ── The way back ──────────────────────────────────────────────────────────
  // A consumer that can render an object but cannot open it has half a
  // reference. This is a tag rather than manifest content because that is where
  // NIP-89 puts it, so it has to be checked on the stored *event*.
  const web = stored.tags.find((t) => t[0] === 'web')
  check('it publishes a web URL for opening an object', !!web, web?.[1])
  check('  …with a <bech32> placeholder the consumer substitutes', web?.[1]?.includes('<bech32>') ?? false)
  check('  …declared as an naddr, since both kinds are addressable', web?.[2] === 'naddr')
  check(
    '  …pointing at the inbound route, which resolves the Folder itself',
    web?.[1]?.includes('/o/') ?? false,
    `base ${process.env.APP_URL ?? DEFAULT_APP_URL}`,
  )
  // A path now, not a fragment (SHI-16). This check asserted `#/o/` and caught
  // the half of that change I had missed — the `web` tag moved and the check
  // did not — which is the whole reason it is here rather than in a unit test.
  check('  …as a path, since SHI-16 took the hash out of every route', !web?.[1]?.includes('#/'))

  /*
    RFC 0.5 §7.5's `urls` — the inbound half, and the thing PRO-15 matches a
    pasted link against.

    Checked on the stored event for the same reason `web` is: NIP-89 puts it in
    a tag, so a manifest that parsed fine can still have published nothing.
  */
  const urls = stored.tags.filter((t) => t[0] === 'urls')
  check('it declares the URL shapes it serves', urls.length > 0, `${urls.length} shape(s)`)
  check(
    '  …each naming the kind it resolves to',
    urls.every((t) => Number.isInteger(Number(t[2]))),
    urls.map((t) => `${t[1]} → ${t[2]}`).join('  '),
  )
  check(
    '  …with a <d> placeholder, which is the only part that resolves',
    urls.every((t) => t[1]?.includes('<d>')),
  )
  check(
    '  …including the hash shape, so links published before SHI-16 still resolve',
    urls.some((t) => t[1]?.includes('#/')),
  )

  // ── The check that matters: can the projections be satisfied? ─────────────
  // Publish one real project and one real issue, move the issue's status, then
  // resolve every declared slot against the actual events.
  const store = new Store(relay, secretKeySigner(identity.secretKeyHex))
  // A project is filed into a team (FOL-2); a bare channel stands in for one here.
  const team = crypto.randomUUID()
  await store.ensureFolder(team, `team-${team.slice(0, 8)}`)
  const project = await store.createProject({ title: 'Payment integration', description: 'Stripe Checkout.', team: { folder: team, hasState: false } })
  const folder = project.folder
  const issue = await store.createIssue({ folder, title: 'Billing entry', description: 'Settings entry point.', projectAddr: project.addr, ref: 'PAY-1' })
  await store.setField({ folder, target: issue.addr, field: 'status', value: 'in_progress' })
  await store.setField({ folder, target: issue.addr, field: 'assignee', value: identity.pubkey })

  /*
    `loadAll`, not `rawFolders([folder])`.

    REW-11 made the project record global: it carries `buzz-channel` and no
    `h`, so an `#h` read cannot see it and this check reported "kind:30850 has
    no real object to project" on every run — the script wrong, not the
    manifest. `loadAll` is the method that sees both shapes, which is why the
    app and the agent both use it and why `rawFolders` documents itself as the
    read-one-container path.

    `raw` is still the `#h` read, because the per-slot checks need the raw root
    *events* and the issue's are channel-scoped. The project's root event is
    fetched separately, by address, for the same reason it is not in `raw`.
  */
  const raw = await store.rawFolders([folder])
  const [projectRoot] = await relay.query([
    { kinds: [KIND.PROJECT], authors: [identity.pubkey], '#d': [project.id], limit: 1 },
  ])
  const rootEvents = projectRoot ? [...raw, projectRoot] : raw
  const state = await store.loadAll()
  console.log('')

  for (const [kindStr, projection] of Object.entries(manifest.projections)) {
    const kind = Number(kindStr)
    // By id, not by index: `loadAll` returns the whole workspace, so
    // `projects[0]` is whichever project sorts first and not necessarily the
    // one this run just created.
    const object =
      kind === KIND.PROJECT
        ? state.projects.find((x) => x.addr === project.addr)
        : state.issues.find((x) => x.addr === issue.addr)
    const rootEvent = rootEvents.find((e) => e.kind === kind)
    if (!rootEvent || !object) {
      check(`kind:${kind} has a real object to project`, false)
      continue
    }
    for (const [slotName, source] of Object.entries(projection.slots)) {
      const sources = Array.isArray(source) ? source : [source]
      for (const slot of sources) {
        // A `list` is a relay query rather than a read of this event, so it is
        // checked against the child that was just published rather than
        // resolved to a string like the others.
        if ('children' in slot) {
          await checkListSlot(relay, slot, project.addr, issue.addr)
          continue
        }
        const value = resolveSlot(slot, rootEvent, object.fields)
        // The whole chain, in the order it is tried — a slot that is fold, tag
        // and content read as just "tag:description" is how the ordering bug
        // above stayed invisible in the output.
        const sourceLabel = [
          'fold' in slot ? `fold:${slot.fold}` : '',
          'tag' in slot && slot.tag ? `tag:${slot.tag}` : '',
          'field' in slot && slot.field ? 'content' : '',
        ]
          .filter(Boolean)
          .join(' → ')
        // `meta` slots are legitimately optional — an issue with no ref is
        // fine. Required slots are not.
        const required = slotName === 'title' || slotName === 'status'
        if (required) {
          check(`kind:${kind} slot "${slotName}" (${sourceLabel}) resolves`, value !== undefined && value !== '', String(value))
        } else {
          console.log(`   kind:${kind} slot "${slotName}" (${sourceLabel}) → ${value ?? '(empty, optional)'}`)
        }
      }
    }
  }

  // The whole reason `fold` exists as a slot source. If this passes with
  // `{"tag":"status"}` instead, something has quietly regressed.
  const issueProjection = manifest.projections[String(KIND.ISSUE)]
  const statusSlot = issueProjection?.slots.status as SlotSource
  check(
    'the issue status slot reads from the fold, not a tag',
    !!statusSlot && 'fold' in statusSlot,
    JSON.stringify(statusSlot),
  )
  check(
    'and it resolves to the folded value',
    resolveSlot(
      statusSlot,
      raw.find((e) => e.kind === KIND.ISSUE)!,
      state.issues.find((x) => x.addr === issue.addr)!.fields,
    ) === 'in_progress',
  )

  // Every `map` must name a vocabulary that exists, or a consumer cannot render
  // the value it was handed.
  const vocabNames = new Set(Object.keys(manifest.vocabularies ?? {}))
  const referenced = new Set<string>()
  for (const projection of Object.values(manifest.projections)) {
    for (const source of Object.values(projection.slots)) {
      for (const slot of Array.isArray(source) ? source : [source]) {
        if ('map' in slot && slot.map) referenced.add(slot.map)
      }
    }
  }
  check(
    'every referenced vocabulary is declared',
    [...referenced].every((name) => vocabNames.has(name)),
    `${[...referenced].join(', ')} ⊆ ${[...vocabNames].join(', ')}`,
  )

  /*
    Every status says what it *means*, not only what it is called.

    PRO-2. A consumer that wants to report progress has to know which statuses
    are finished, and before this it had to guess from the label — Peek matched
    a hardcoded set of English words, so an app spelling its statuses
    differently rendered a blank section. The stage is what makes that a
    declaration instead of a guess, and a vocabulary missing one is the same
    silent failure wearing a different hat: it publishes fine and shows up as a
    counter that is quietly wrong.

    `dropped` is checked for separately because it is the value with no natural
    fallback. A consumer can survive a missing `started` by treating it as open;
    there is nothing sensible to assume about a status that is neither
    outstanding nor progress, and Ship has one (`cancelled`) in both vocabularies.

    Only the vocabularies a slot maps — the statuses. `archived` (MAN-4) feeds
    an action's select and says whether a project is listed, not how far along
    it is; giving it a stage would make it read as progress.
  */
  const STAGES = new Set(['open', 'started', 'done', 'dropped'])
  const entries = Object.entries(manifest.vocabularies ?? {}).filter(([name]) => referenced.has(name))
  const missing = entries.flatMap(([name, values]) =>
    values.filter((v) => !v.stage).map((v) => `${name}.${v.value}`),
  )
  check('every status declares a stage', missing.length === 0, missing.join(', ') || 'all declared')
  const bad = entries.flatMap(([name, values]) =>
    values.filter((v) => v.stage && !STAGES.has(v.stage)).map((v) => `${name}.${v.value}=${v.stage}`),
  )
  check('  …and every stage is one of the four', bad.length === 0, bad.join(', ') || [...STAGES].join('|'))
  check(
    '  …including a dropped status, which nothing can infer',
    entries.every(([, values]) => values.some((v) => v.stage === 'dropped')),
    entries.map(([n, vs]) => `${n}:${vs.filter((v) => v.stage === 'dropped').map((v) => v.value).join('/') || 'none'}`).join(' '),
  )

  /*
    Take the fixtures back out.

    The checks above need *real* published events, which is the point — a
    projection that resolves against a hand-built object proves nothing about
    the relay. But the objects were only ever scaffolding, and until now the
    script left them behind: four "Payment integration" projects and twelve
    child events had accumulated on production by 2026-08-25, from runs going
    back months, two of them created the same afternoon this cleanup was
    written. They show up in every project list in both apps.

    Deletable because the manifest key signs them and NIP-09 is author-scoped —
    the same property that makes the agent's own writes permanent works in our
    favour here. Addressable objects go by `a`, the change events by `e`.

    Reported rather than checked: a failed cleanup is litter, not a wrong
    manifest, and failing the run for it would bury the result that matters.
  */
  const removed: boolean[] = []
  for (const addr of [issue.addr, project.addr]) {
    const { result } = await store.deleteProject({ recordFolder: folder, project: addr, reason: 'manifest verification fixture', teams: [{ folder, hasState: false }] })
    removed.push(result.ok)
  }
  for (const e of raw.filter((x) => x.kind === KIND.CHANGE && x.pubkey === identity.pubkey)) {
    const r = await relay.publish(signEvent(buildEventDeletion(identity.pubkey, Date.now(), { targetEventId: e.id }), identity.secretKeyHex))
    removed.push(r.ok)
  }
  console.log(
    removed.every(Boolean)
      ? `\n   removed ${removed.length} verification fixture(s)`
      : `\n   ⚠ ${removed.filter((x) => !x).length} of ${removed.length} fixture(s) could not be removed — check the workspace for stray "Payment integration" projects`,
  )

  console.log(
    failures === 0
      ? `\nManifest published and satisfiable. Address: 31990:${identity.pubkey}:${MANIFEST_D_TAG}`
      : `\n${failures} check(s) FAILED.`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
