/**
 * End-to-end check against a live relay.
 *
 * This is the script that has to pass for the design claim to be true, so it is
 * written to fail loudly rather than to look good:
 *
 *  1. A Folder is created, and every object goes into it.
 *  2. **Ana** creates a project and two issues.
 *  3. **Ravi** — a different keypair, who authored none of them — moves an
 *     issue to `in_progress`, assigns it to himself and then closes it.
 *  4. Everything is read back **from the relay** and folded. The check is that
 *     the fold shows Ravi's status on Ana's issue, and that Ana's root event is
 *     still byte-for-byte Ana's.
 *
 * Step 3 is the one that cannot be done with mutable records: NIP-33 addresses
 * are `(pubkey, kind, d)`, so Ravi has no way to replace Ana's event.
 *
 *   npx tsx scripts/verify.ts
 */
import { randomUUID } from 'node:crypto'
import { Relay } from '../lib/nostr/relay'
import { publicKeyFromSecret } from '../lib/nostr/sign'
import { Store } from '../src/store'
import { foldFolder } from '../src/fold'
import { KIND } from '../src/kinds'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'

function person(name: string) {
  const secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  const identity = { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
  return { name, identity, store: new Store(new Relay(RELAY_URL, identity), identity) }
}

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

/** Publish, and treat a relay rejection as a hard stop rather than a warning. */
async function must(label: string, action: () => Promise<{ ok: boolean; reason?: string }>) {
  const result = await action()
  if (!result.ok) {
    console.error(`\n✋ ${label} was rejected by the relay: ${result.reason ?? '(no reason)'}`)
    process.exit(1)
  }
}

async function main() {
  const ana = person('Ana')
  const ravi = person('Ravi')
  const folder = randomUUID()

  console.log(`relay  ${RELAY_URL}`)
  console.log(`folder ${folder}`)
  console.log(`Ana    ${ana.identity.pubkey.slice(0, 16)}…`)
  console.log(`Ravi   ${ravi.identity.pubkey.slice(0, 16)}…\n`)

  // ── 1. The Folder ──────────────────────────────────────────────────────────
  await must('Folder create', () => ana.store.ensureFolder(folder, `verify-${folder.slice(0, 8)}`))
  // Ravi has to be a member before he can write into Ana's Folder. Access is
  // the Folder — grouping and permission are the same mechanism (RFC §1.1).
  await must('Add Ravi to the Folder', async () => {
    const { buildAddMember } = await import('../lib/nostr/events')
    const { signEvent } = await import('../lib/nostr/sign')
    return new Relay(RELAY_URL, ana.identity).publish(
      signEvent(
        buildAddMember(ana.identity.pubkey, Date.now(), {
          channelUuid: folder,
          targetPubkey: ravi.identity.pubkey,
          role: 'member',
        }),
        ana.identity.secretKeyHex,
      ),
    )
  })

  // ── 2. Ana authors the objects ─────────────────────────────────────────────
  const project = await ana.store.createProject({
    folder,
    title: 'Payment integration',
    description: 'Stripe Checkout for workspace billing — redirect flow, no custom card form.',
  })
  await must('Ana creates the project', async () => project.result)

  const billing = await ana.store.createIssue({
    folder,
    title: 'Billing entry + add payment method',
    description: 'Entry point in settings, plus the empty-state when no card is on file.',
    projectAddr: project.addr,
    ref: 'PAY-1',
  })
  await must('Ana creates issue PAY-1', async () => billing.result)

  const webhook = await ana.store.createIssue({
    folder,
    title: 'Handle Stripe webhooks',
    projectAddr: project.addr,
    ref: 'PAY-2',
  })
  await must('Ana creates issue PAY-2', async () => webhook.result)

  // ── 3. Ravi acts on Ana's issue ────────────────────────────────────────────
  // Three changes in sequence. They must land in this order for last-write-wins
  // to be observable, and `created_at` has one-second resolution, so the fold's
  // event-id tie-break is doing real work here rather than hypothetical work.
  for (const [field, value, note] of [
    ['status', 'in_progress', 'picking this up'],
    ['assignee', ravi.identity.pubkey, 'assigned to me'],
    ['status', 'done', 'shipped'],
  ]) {
    await must(`Ravi sets ${field}=${value.slice(0, 12)}`, () =>
      ravi.store.setField({ folder, target: billing.addr, field, value, note }),
    )
  }

  // ── 4. Read back and fold ──────────────────────────────────────────────────
  // Read as Ravi, to prove this is the shared record and not one client's cache.
  const raw = await ravi.store.rawFolder(folder)
  const state = foldFolder(raw)

  console.log(`\nread back ${raw.length} events from the relay\n`)

  check(
    'the relay stored all six objects',
    raw.length === 6,
    `${raw.filter((e) => e.kind === KIND.PROJECT).length} project, ` +
      `${raw.filter((e) => e.kind === KIND.ISSUE).length} issues, ` +
      `${raw.filter((e) => e.kind === KIND.CHANGE).length} changes`,
  )

  const folded = state.issues.find((issue) => issue.addr === billing.addr)
  check('PAY-1 folds back', !!folded)
  if (!folded) return

  check('status is Ravi\'s last write, not his first', folded.status === 'done', `status=${folded.status}`)
  check('the status was set BY RAVI', folded.fields.status?.by === ravi.identity.pubkey, `by ${folded.fields.status?.by.slice(0, 8)}…`)
  check('the issue is still AUTHORED BY ANA', folded.author === ana.identity.pubkey, `author ${folded.author.slice(0, 8)}…`)
  check('assignee folded to Ravi', folded.assignee === ravi.identity.pubkey)
  check('the root event was never rewritten', folded.title === 'Billing entry + add payment method')
  check('PAY-1 is under Ana\'s project', folded.projectAddr === project.addr)

  const untouched = state.issues.find((issue) => issue.addr === webhook.addr)
  check('an issue with no changes defaults to todo', untouched?.status === 'todo', `status=${untouched?.status}`)

  check('the activity feed is the change stream', state.activity.length === 3, `${state.activity.length} entries`)
  check(
    'the feed reads oldest-first in fold order',
    state.activity.map((c) => `${c.field}=${c.value === ravi.identity.pubkey ? 'ravi' : c.value}`).join(', ') ===
      'status=in_progress, assignee=ravi, status=done',
    state.activity.map((c) => c.field).join(' → '),
  )

  // The regression guard for the reason `ts` exists at all. If those three
  // changes shared one `created_at`, then the two checks above only passed
  // because of millisecond ordering — and if a future change drops `ts`, they
  // go back to failing. Assert the condition is actually being exercised, so
  // this does not quietly become a test of nothing.
  const seconds = new Set(state.activity.map((change) => change.createdAt))
  check(
    'the ordering fix is being exercised (changes share a created_at second)',
    seconds.size < state.activity.length,
    `${state.activity.length} changes across ${seconds.size} second(s)`,
  )
  check(
    'every change carries a ts consistent with its created_at',
    state.activity.every((c) => c.ts !== undefined && Math.floor(c.ts / 1000) === c.createdAt),
  )

  const { buildChange } = await import('../src/events')
  const { signEvent } = await import('../lib/nostr/sign')

  // ── 5. A `ts` nobody should believe ────────────────────────────────────────
  // Under the honour system, nothing validates another app's writes
  // (RFC_UPDATES.md §3), so a buggy or pushy client can claim any `ts` it likes.
  // A `ts` far in the future would win every fold forever. The fold accepts
  // `ts` only when it agrees with the relay-validated `created_at`, so this one
  // must be ignored and the later, honest change must still win.
  const liar = buildChange(ravi.identity.pubkey, Date.now(), {
    target: webhook.addr,
    field: 'status',
    value: 'cancelled',
    folder,
  })
  const forged = {
    ...liar,
    tags: liar.tags.map((t) => (t[0] === 'ts' ? ['ts', String(2 ** 52)] : t)),
  }
  await must('Ravi publishes a change with a far-future ts', () =>
    new Relay(RELAY_URL, ravi.identity).publish(signEvent(forged, ravi.identity.secretKeyHex)),
  )
  // A full second later, so this one wins on `created_at` alone and the result
  // does not depend on a millisecond tie-break.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await must('Ravi then honestly sets it to done', () =>
    ravi.store.setField({ folder, target: webhook.addr, field: 'status', value: 'done' }),
  )
  const afterLie = foldFolder(await ravi.store.rawFolder(folder)).issues.find(
    (issue) => issue.addr === webhook.addr,
  )
  check(
    'a far-future ts does not win the fold',
    afterLie?.status === 'done',
    `status=${afterLie?.status}`,
  )

  // The Folder is required, and the relay — not the client — is what enforces
  // it. A client that forgot would otherwise write an unreachable object into
  // the shared space, and on Nostr nobody can unpublish it.
  const orphan = buildChange(ravi.identity.pubkey, Date.now(), {
    target: billing.addr,
    field: 'status',
    value: 'cancelled',
    folder,
  })
  const stripped = { ...orphan, tags: orphan.tags.filter((t) => t[0] !== 'h') }
  const rejected = await new Relay(RELAY_URL, ravi.identity).publish(
    signEvent(stripped, ravi.identity.secretKeyHex),
  )
  check('the relay rejects a Change with no Folder', !rejected.ok, rejected.reason ?? 'accepted!')

  console.log(
    failures === 0
      ? '\nAll checks passed. Ravi changed Ana\'s issue without rewriting her event.'
      : `\n${failures} check(s) FAILED.`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
