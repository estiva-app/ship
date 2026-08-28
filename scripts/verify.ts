/**
 * End-to-end check against a live relay.
 *
 * This is the script that has to pass for the design claim to be true, so it is
 * written to fail loudly rather than to look good:
 *
 *  1. **Ana** creates a project, which creates the Folder the project *is*.
 *  2. She files two issues into it.
 *  3. **Ravi** — a different keypair, who authored none of them — moves an
 *     issue to `in_progress`, assigns it to himself and then closes it.
 *  4. Everything is read back **from the relay** and folded. The check is that
 *     the fold shows Ravi's status on Ana's issue, and that Ana's root event is
 *     still byte-for-byte Ana's.
 *
 * Step 3 is the one that cannot be done with mutable records: NIP-33 addresses
 * are `(pubkey, kind, d)`, so Ravi has no way to replace Ana's event.
 *
 * Steps 1–2 pin the container model: a project **is** a Folder, and there is no
 * workspace object above it — Buzz already scopes the organisation by relay
 * host. Projects are found by discovery rather than by reading an index, which
 * is asserted here too, because an index would work in a test and quietly fail
 * for anyone who was not in it.
 *
 *   npx tsx scripts/verify.ts
 */
import { randomUUID } from 'node:crypto'
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { addrToNaddr } from '@estiva-app/protocol'
import { Store } from '../src/store'
import { conversationsAbout, foldFolder, projectFolders } from '../src/fold'
import { KIND } from '../src/kinds'

const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:3000'

/**
 * The raw key is kept alongside the signer on purpose: the forgery checks below
 * sign an event whose `pubkey` is somebody else's, and a signer will not do
 * that — attributing to its own key is the guarantee it exists to make.
 */
function person(name: string) {
  const secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  const signer = secretKeySigner(secretKeyHex)
  const identity = { secretKeyHex, pubkey: signer.pubkey }
  return { name, identity, signer, store: new Store(new Relay(RELAY_URL, signer), signer) }
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

  console.log(`relay  ${RELAY_URL}`)
  console.log(`Ana    ${ana.identity.pubkey.slice(0, 16)}…`)
  console.log(`Ravi   ${ravi.identity.pubkey.slice(0, 16)}…\n`)

  /**
   * Ravi has to be a member before he can write into one of Ana's Folders.
   * Access *is* the Folder — grouping and permission are the same mechanism
   * (RFC §1.1) — which is why this has to happen once per Folder rather than
   * once per person.
   */
  const addRavi = async (folder: string) => {
    const { buildAddMember } = await import('@estiva-app/protocol')
    const { signEvent } = await import('@estiva-app/protocol')
    return new Relay(RELAY_URL, ana.signer).publish(
      signEvent(
        buildAddMember(ana.identity.pubkey, Date.now(), {
          channelUuid: folder,
          targetPubkey: ravi.identity.pubkey,
          role: 'member',
        }),
        ana.identity.secretKeyHex,
      ),
    )
  }

  // ── 1. Ana authors the objects ─────────────────────────────────────────────
  // createProject publishes two events: the Folder, then the record inside it.
  const project = await ana.store.createProject({
    title: 'Payment integration',
    description: 'Stripe Checkout for workspace billing — redirect flow, no custom card form.',
  })
  await must('Ana creates the project', async () => project.result)
  const folder = project.folder
  console.log(`project Folder ${folder}\n`)
  await must('Add Ravi to the project Folder', () => addRavi(folder))

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
  const raw = await ravi.store.rawFolders([folder])
  const state = foldFolder(raw)

  console.log(`\nread back ${raw.length} events from the relay\n`)

  check(
    'the relay stored all six objects',
    raw.length === 6,
    `${raw.filter((e) => e.kind === KIND.PROJECT).length} project, ` +
      `${raw.filter((e) => e.kind === KIND.ISSUE).length} issues, ` +
      `${raw.filter((e) => e.kind === KIND.CHANGE).length} changes`,
  )

  // ── One container per project ──────────────────────────────────────────────
  // The claim being pinned: the project and everything in it share one `h`, so
  // pairing with a Peek topic is just "create it there" and access to the topic
  // is access to the work.
  const h = (event: { tags: string[][] }) => event.tags.find((t) => t[0] === 'h')?.[1]
  check(
    'every event lives in the one project Folder',
    raw.every((e) => h(e) === folder),
    `${new Set(raw.map(h)).size} distinct h across ${raw.length} events`,
  )

  const foldedProject = state.projects.find((p) => p.addr === project.addr)
  check('the project reports that Folder as its own', foldedProject?.contentFolder === folder)
  check(
    'a reader can find the issues from the project alone',
    projectFolders(foldedProject!, state.activity).includes(folder),
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
  const { signEvent } = await import('@estiva-app/protocol')

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
    new Relay(RELAY_URL, ravi.signer).publish(signEvent(forged, ravi.identity.secretKeyHex)),
  )
  // A full second later, so this one wins on `created_at` alone and the result
  // does not depend on a millisecond tie-break.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await must('Ravi then honestly sets it to done', () =>
    ravi.store.setField({ folder, target: webhook.addr, field: 'status', value: 'done' }),
  )
  const afterLie = foldFolder(await ravi.store.rawFolders([folder])).issues.find(
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
  const rejected = await new Relay(RELAY_URL, ravi.signer).publish(
    signEvent(stripped, ravi.identity.secretKeyHex),
  )
  check('the relay rejects a Change with no Folder', !rejected.ok, rejected.reason ?? 'accepted!')

  // ── 6. Comments, and the handler recommendation ────────────────────────────
  // Both are what Peek needs: something to render, and a way to know which
  // manifest renders it.
  await must('Ana starts a conversation on her issue', () =>
    ana.store.postMessage({ folder, about: billing.addr, body: 'Blocked on the Stripe key.' }),
  )
  const [started] = await ravi.store.rawFolders([folder]).then((raw) =>
    raw.filter((e) => e.kind === KIND.MESSAGE),
  )
  await must('Ravi replies in it', () =>
    ravi.store.postMessage({
      folder,
      body: 'Key is in 1Password now.',
      replyTo: { rootId: started.id, parentId: started.id },
    }),
  )

  const talked = await ravi.store.loadFolder(folder)
  const onIssue = conversationsAbout(talked.conversations, billing.addr)
  check('the conversation attaches to the issue', onIssue.length === 1)
  check('  …with the reply threaded under it', onIssue[0]?.replies.length === 1)
  check('  …root first', onIssue[0]?.root.body.startsWith('Blocked'))
  check('  …by two different people', onIssue[0]?.root.author !== onIssue[0]?.replies[0]?.author)
  check(
    'an issue nobody discussed has no conversation',
    conversationsAbout(talked.conversations, webhook.addr).length === 0,
  )

  // Scenario 4: a thread that mentions an issue only partway through belongs to
  // that issue in full, so the context arrives with the answer.
  await must('someone starts an unrelated conversation', () =>
    ana.store.postMessage({ folder, body: 'Anyone looking at billing this week?' }),
  )
  const afterUnrelated = await ravi.store.rawFolders([folder])
  const unrelated = afterUnrelated
    .filter((e) => e.kind === KIND.MESSAGE)
    .find((e) => e.content.startsWith('Anyone looking'))!
  await must('and later mentions the issue in a reply', () =>
    ravi.store.postMessage({
      folder,
      body: `that is ${`nostr:${addrToNaddr(webhook.addr, [RELAY_URL])}`}`,
      replyTo: { rootId: unrelated.id, parentId: unrelated.id },
    }),
  )
  const afterMention = await ravi.store.loadFolder(folder)
  const pulled = conversationsAbout(afterMention.conversations, webhook.addr)
  check('a mention mid-thread attaches the WHOLE conversation', pulled.length === 1)
  check(
    '  …including the message posted before the mention',
    pulled[0]?.root.body.startsWith('Anyone looking'),
    pulled[0]?.root.body,
  )

  // ── Discovery, not an index ───────────────────────────────────────────────
  // How the project list is actually built: ask the relay for the kind, with no
  // `#h` at all, and let access control decide. If this ever stops working the
  // sidebar goes empty for everyone who is not the author.
  const discovered = await new Relay(RELAY_URL, ravi.signer).queryAll([
    { kinds: [KIND.PROJECT] },
  ])
  check(
    'a reader discovers the project with no Folder filter',
    discovered.some((e) => e.id === raw.find((r) => r.kind === KIND.PROJECT)?.id),
    `${discovered.length} project(s) visible to Ravi`,
  )

  await must('Ana recommends a handler for her kinds', async () => {
    const [first, second] = await ana.store.recommendHandler(RELAY_URL)
    return first.ok ? second : first
  })

  // Resolve it the way Peek will: given an object authored by Ana, find Ana's
  // recommendation for that kind. This is the tie-break that makes `#k`
  // discovery usable when several manifests claim the same kind.
  const [recommendation] = await new Relay(RELAY_URL, ravi.signer).query([
    { kinds: [31989], authors: [ana.identity.pubkey], '#d': [String(KIND.ISSUE)], limit: 1 },
  ])
  check('a consumer finds the issue author\'s recommendation', !!recommendation)
  const recommended = recommendation?.tags.find((t) => t[0] === 'a')?.[1]
  check(
    '  …and it points at a kind:31990 manifest',
    !!recommended && recommended.startsWith('31990:'),
    recommended,
  )

  // ── 7. Re-linking a project to an existing Peek topic ─────────────────────
  // The regression guard for a bug that looked like "creating a ticket is
  // broken". Discovery asks for kind:30850 only, so it cannot contain the
  // kind:1851 that re-points a project — a single-pass read finds the project,
  // misses the re-link, and never queries the topic. Writes landed correctly
  // and were then never read back.
  const topic = randomUUID()
  await must('A Peek-style topic Folder exists', () =>
    ana.store.ensureFolder(topic, `topic-${topic.slice(0, 8)}`),
  )
  await must('Ravi pairs Ana\'s project with it', () =>
    ravi.store.linkProjectFolder({ recordFolder: folder, project: project.addr, folder: topic }),
  )
  await must('an issue filed after pairing goes to the topic', async () => {
    const { result } = await ana.store.createIssue({
      folder: topic,
      title: 'Filed after pairing',
      projectAddr: project.addr,
    })
    return result
  })
  await must('and a conversation on the project goes there too', () =>
    ana.store.postMessage({ folder: topic, about: project.addr, body: 'After pairing' }),
  )

  const relinked = await ravi.store.loadAll()
  const relinkedProject = relinked.projects.find((p) => p.addr === project.addr)
  check('the project now reports the topic as its Folder', relinkedProject?.contentFolder === topic)
  check(
    'an issue filed after pairing is read back',
    relinked.issues.some((issue) => issue.title === 'Filed after pairing'),
  )
  check(
    'a conversation started after pairing is read back',
    conversationsAbout(relinked.conversations, project.addr).some(
      (c) => c.root.body === 'After pairing',
    ),
  )
  check(
    '  …and the issues filed BEFORE pairing did not disappear',
    relinked.issues.some((issue) => issue.addr === billing.addr),
  )

  // ── 8. Archive and delete ─────────────────────────────────────────────────
  // Two operations with different reach, and the difference is the point.
  // Archiving is a change event, so anyone in the Folder can do it and it can
  // be undone. Deleting is NIP-09, author-scoped, and irreversible.
  await must('Ravi archives Ana\'s project', () =>
    ravi.store.archiveProject({
      recordFolder: folder,
      project: project.addr,
      archived: true,
    }),
  )
  const archivedState = foldFolder(await ravi.store.rawFolders([folder]))
  const archivedProject = archivedState.projects.find((p) => p.addr === project.addr)
  check('a non-author can archive', archivedProject?.archived === true)
  check(
    '  …and it is attributed to him',
    archivedProject?.fields.archived?.by === ravi.identity.pubkey,
  )

  await must('Ravi unarchives it again', () =>
    ravi.store.archiveProject({ recordFolder: folder, project: project.addr, archived: false }),
  )
  check(
    'archiving is reversible',
    foldFolder(await ravi.store.rawFolders([folder])).projects.find(
      (p) => p.addr === project.addr,
    )?.archived === false,
  )

  // NIP-09 is scoped to the pubkey that signed the original. Ravi asking for
  // Ana's project to go away must not work, or "delete" would be an attack.
  await ravi.store.deleteProject({ recordFolder: folder, project: project.addr })
  const afterRavi = await ravi.store.rawFolders([folder])
  check(
    'a non-author CANNOT delete somebody else\'s project',
    afterRavi.some((e) => e.kind === KIND.PROJECT),
  )

  await must('Ana deletes her own project', () =>
    ana.store.deleteProject({ recordFolder: folder, project: project.addr }),
  )
  const afterAna = await ana.store.rawFolders([folder])
  check(
    'the author\'s deletion is honoured',
    !afterAna.some((e) => e.kind === KIND.PROJECT),
    `${afterAna.filter((e) => e.kind === KIND.PROJECT).length} project event(s) left`,
  )
  check(
    '  …but the issues are separate events and survive',
    afterAna.filter((e) => e.kind === KIND.ISSUE).length === 2,
    `${afterAna.filter((e) => e.kind === KIND.ISSUE).length} issue(s) still in the Folder`,
  )

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
