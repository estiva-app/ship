/**
 * Read Ship knowing nothing about Ship, using only its NIP-89 manifest.
 *
 * The ecosystem's design claim is that an app publishes enough about itself for
 * another app to render and act on its objects without being written against
 * it. An agent is the most demanding consumer of that claim available, so
 * PEEK-150 asked the blunt version: can the agent read an app it has never
 * heard of, from the manifest alone?
 *
 *   npm run probe:manifest
 *
 * ## The rule this file obeys
 *
 * **It imports nothing from `src/`.** No `KIND`, no `fold.ts`, no `store.ts`,
 * no vocabulary. Every kind number, tag name, ordering rule and status label it
 * uses has to come out of the manifest it fetched at runtime, or the experiment
 * is measuring the wrong thing. `manifest-reader.test.ts` asserts that, because
 * a single convenient import would quietly turn this back into Ship-specific
 * code that happens to read a manifest.
 *
 * The only thing it is told out of band is the app's `d` tag: somebody said
 * "read Estiva Ship". That is the premise, not a shortcut — a consumer holding
 * an object would instead find the manifest by `#k`, which is the same query
 * with a different filter.
 *
 * ## The answer, measured against production on 2026-08-21
 *
 * **Rendering works and discovery does not.** Both projections rendered — title,
 * truncated subtitle, status resolved through the declared vocabulary, `ref`,
 * and assignee resolved from a pubkey to a name — with output indistinguishable
 * from what the Ship-specific CLI prints. `records` is what made that possible:
 * the fold rules are declared, so a stranger can apply them.
 *
 * What is missing is everything *relational*. The reader cannot tell which kind
 * is the unit of work, cannot find an issue's project, cannot scope to a Folder,
 * cannot read a conversation, and cannot know whether its read was complete.
 * The gaps it prints are the finding, and they are written up in peek-app's
 * `docs/buzz-compat/RFC_UPDATES.md` §3.
 *
 * One result worth keeping in view: because this reader has no containment
 * model, it never narrows, so it sees **every** issue — including the ones
 * PEEK-154 calls unreachable, whose projects were deleted out from under them.
 * That is luck rather than correctness, but it does suggest the discovery model
 * is the thing at fault rather than the data.
 */
import { clientCredentialsToken, loadCredentials } from '../lib/agent/credentials'
import { Relay } from '../lib/nostr/relay'
import { estivaIdSigner } from '../lib/nostr/signer'
import type { SignedEvent } from '../lib/nostr/events'

const RELAY_URL = (process.env.RELAY_URL ?? 'https://estiva.estiva.app').replace(/\/+$/, '')
const APP = process.env.APP_D ?? 'estiva-ship'

/** NIP-89's own kind, and the only number this file is allowed to know. */
const HANDLER_INFORMATION = 31990

const tag = (event: SignedEvent, name: string) =>
  event.tags.find((candidate) => candidate[0] === name)?.[1]

const addressOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${tag(event, 'd') ?? ''}`

const gaps: string[] = []
function gap(what: string) {
  gaps.push(what)
  console.log(`   ⛔ ${what}`)
}

interface SlotSource {
  tag?: string
  field?: string
  fold?: string
  map?: string
  as?: string
  label?: string
  default?: string
  truncate?: number
}

async function main() {
  const credentials = loadCredentials()
  const token = await clientCredentialsToken(credentials)
  const signer = estivaIdSigner({
    base: credentials.base,
    pubkey: token.pubkey,
    token: token.access_token,
  })
  const relay = new Relay(RELAY_URL, signer)

  // ── 1. Find the app ───────────────────────────────────────────────────────
  console.log(`1. Discover the app\n   kind:${HANDLER_INFORMATION} #d=${APP} on ${RELAY_URL}`)
  const manifests = await relay.query([
    { kinds: [HANDLER_INFORMATION], '#d': [APP], limit: 10 },
  ])
  if (manifests.length !== 1) {
    console.error(`   ${manifests.length} manifests for "${APP}" — cannot proceed unambiguously`)
    process.exit(1)
  }
  const manifest = manifests[0]
  const content = JSON.parse(manifest.content)
  const handled = manifest.tags
    .filter((candidate) => candidate[0] === 'k')
    .map((candidate) => Number(candidate[1]))
  console.log(`   ✅ "${content.name}" — handles kinds ${JSON.stringify(handled)}`)

  const records = content.records
  const projections: Record<string, { widget: string; slots: Record<string, SlotSource | SlotSource[]> }> =
    content.projections ?? {}

  // ── 2. Fetch what it declares ─────────────────────────────────────────────
  console.log(`\n2. Fetch every object of every declared kind`)
  const byKind = new Map<number, SignedEvent[]>()
  for (const kind of handled) {
    const events = await relay.query([{ kinds: [kind], limit: 2000 }])
    byKind.set(kind, events)
    console.log(`   kind:${kind} → ${events.length} event(s)`)
  }

  // ── 3. Fold, using only the declared rule ─────────────────────────────────
  if (!records) {
    gap('no `records` block, so no field that is set by a change event is readable')
    console.log(`\n${gaps.length} gap(s).`)
    return
  }
  console.log(`\n3. Fold changes — rule "${records.rule}"`)
  const changes = await relay.query([{ kinds: [records.changeKind], limit: 2000 }])
  console.log(`   kind:${records.changeKind} → ${changes.length} change event(s)`)

  /**
   * Ordering, transcribed from `records.orderingTrust` rather than invented.
   *
   * That sentence is the reason a stranger can fold at all: two changes landing
   * in the same second is the common case, not the rare one, and without a
   * declared tie-break every consumer picks a different winner.
   */
  const rank = (event: SignedEvent) => {
    const raw = tag(event, 'ts')
    const ts = raw ? Number(raw) : Number.NaN
    const trustworthy = Number.isFinite(ts) && Math.abs(Math.floor(ts / 1000) - event.created_at) <= 1
    return trustworthy ? ts : event.created_at * 1000
  }

  const folded = new Map<string, Record<string, string>>()
  const ordered = changes
    .slice()
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))
  for (const change of ordered) {
    const target = tag(change, records.targetTag)
    const field = tag(change, records.fieldTag)
    const value = tag(change, records.valueTag)
    if (!target || !field || value === undefined) continue
    folded.set(target, { ...(folded.get(target) ?? {}), [field]: value })
  }
  console.log(`   ✅ folded fields for ${folded.size} target(s)`)

  // ── 4. Names, from NIP-01 rather than from the manifest ───────────────────
  /*
    kind:0 is deliberately not in Ship's manifest and should not be: it is the
    ecosystem's one answer to "who wrote this", published by whichever app a key
    signs into and read by all of them. Knowing it is knowing Nostr, not knowing
    Ship, so using it here is not cheating.
  */
  const keys = new Set<string>()
  for (const events of byKind.values()) for (const event of events) keys.add(event.pubkey)
  for (const fields of folded.values()) {
    for (const value of Object.values(fields)) {
      if (/^[0-9a-f]{64}$/i.test(value)) keys.add(value.toLowerCase())
    }
  }
  const profiles = await relay.query([{ kinds: [0], authors: [...keys], limit: 500 }])
  const names = new Map<string, string>()
  for (const profile of profiles) {
    try {
      const parsed = JSON.parse(profile.content)
      const name = parsed.display_name ?? parsed.name
      if (name) names.set(profile.pubkey, name)
    } catch {
      // A malformed profile is somebody else's problem; the key stays a key.
    }
  }
  const who = (key: string) => names.get(key.toLowerCase()) ?? `${key.slice(0, 8)}…`

  // ── 5. Render from the declared projections ───────────────────────────────
  console.log(`\n4. Render objects from their declared projections`)
  const vocabulary = (name?: string) => (name ? content.vocabularies?.[name] ?? [] : [])

  const readSlot = (event: SignedEvent, source: SlotSource): string | undefined => {
    let value: string | undefined
    if (source.field === 'content') value = event.content
    else if (source.fold) {
      value =
        folded.get(addressOf(event))?.[source.fold] ??
        (source.tag ? tag(event, source.tag) : undefined) ??
        source.default
    } else if (source.tag) value = tag(event, source.tag)

    if (value === undefined) return undefined

    let text: string = value
    if (source.map) {
      const entry = vocabulary(source.map).find((one: { value: string }) => one.value === text)
      /*
        A value outside the published vocabulary is shown as it is, never
        swallowed. Another app may have written a status this manifest has never
        heard of, and rendering a familiar-looking label instead would invent an
        agreement that does not exist — the note on PEEK-150 makes the same
        point about `input` schemas being an honour system.
      */
      text = entry?.label ?? text
    }
    if (source.as === 'pubkey' && /^[0-9a-f]{64}$/i.test(text)) text = who(text)
    if (source.truncate) text = text.slice(0, source.truncate)
    return text
  }

  const hidden = (event: SignedEvent) =>
    Boolean(records.hiddenWhen) &&
    folded.get(addressOf(event))?.[records.hiddenWhen.field] === records.hiddenWhen.equals

  for (const kind of handled) {
    const projection = projections[String(kind)]
    if (!projection) {
      gap(`kind:${kind} is declared as handled but has no projection, so it cannot be shown`)
      continue
    }
    const all = byKind.get(kind) ?? []
    const visible = all.filter((event) => !hidden(event))
    console.log(`\n   kind:${kind} (${projection.widget}) — ${visible.length} visible of ${all.length}`)
    for (const event of visible.slice(0, 3)) {
      const parts: string[] = []
      for (const [slot, source] of Object.entries(projection.slots)) {
        const sources = Array.isArray(source) ? source : [source]
        const rendered = sources
          .map((one) => {
            const value = readSlot(event, one)
            return value === undefined ? undefined : one.label ? `${one.label}: ${value}` : value
          })
          .filter(Boolean)
        if (rendered.length) parts.push(`${slot}=${rendered.join(' / ')}`)
      }
      console.log(`     · ${parts.join('  ')}`)
    }
  }

  // ── 6. The questions an agent is actually asked ───────────────────────────
  console.log(`\n5. Answer the questions somebody actually asks`)

  console.log(`\n   "list the open issues"`)
  const issueKind = handled.find((kind) => projections[String(kind)]?.widget === 'row')
  console.log(`      inferred the issue kind as ${issueKind} from widget="row"`)
  gap('nothing declares which handled kind is the unit of work; `widget` is a layout hint, not a type')

  const statusSlot = projections[String(issueKind)]?.slots?.status as SlotSource | undefined
  const values = vocabulary(statusSlot?.map).map((entry: { value: string }) => entry.value)
  console.log(`      status vocabulary: ${JSON.stringify(values)}`)
  gap('the vocabulary says which values exist and what to call them, but not which of them mean "still open"')

  console.log(`\n   "what is in project X?"`)
  const anIssue = (byKind.get(issueKind ?? -1) ?? [])[0]
  if (anIssue) {
    console.log(`      an issue really carries: ${JSON.stringify(anIssue.tags.map((t) => t[0]))}`)
    console.log(`      the projection reads:   ${JSON.stringify(Object.keys(projections[String(issueKind)].slots))}`)
  }
  gap("no slot or record declares the issue→project link; the 'a' tag is described only on the write side, in the add-issue action")
  gap("nothing declares the 'h' tag or any container, so a reader cannot scope a query and can only fetch everything")

  console.log(`\n   "show me the discussion on this issue"`)
  gap('conversations appear only as an emitted kind inside the comment action; no projection describes reading them back')

  console.log(`\n   "is that everything?"`)
  gap('no declared discovery model, so a reader cannot tell a complete workspace from a slice, and cannot report coverage')

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Rendering: works, with no Ship-specific code.`)
  console.log(`Discovery: ${gaps.length} gap(s), every one of them relational.`)
  console.log(`Written up in peek-app docs/buzz-compat/RFC_UPDATES.md §3.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
