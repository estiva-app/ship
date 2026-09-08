/**
 * LIV-1 — what does a live socket cost the relay?
 *
 * Every other cost question about the socket was answered by reading Buzz.
 * This one cannot be: it is about load rather than rules. Known already, so not
 * re-measured here — `MAX_SUBSCRIPTIONS` is 1024 per connection
 * (`handlers/req.rs:26`), socket frames are metered on `LimitType::WsEvents` at
 * 10/sec rather than HTTP's `ApiCalls` 300/min, and pushed frames are unmetered
 * (`connection.rs:600` meters only client->server EVENT/REQ/COUNT).
 *
 *   npx tsx scripts/liv1-socket-cost.ts auth
 *   npx tsx scripts/liv1-socket-cost.ts cost
 *   npx tsx scripts/liv1-socket-cost.ts connections
 *
 * ## Why this needs no Estiva ID grant
 *
 * `estiva-ship` may not sign a kind:22242 — `estiva-id/src/db/seed.ts` gives it
 * no such kind and `relayAuthUrls: () => []`, deliberately (LIV-2). That gates
 * every *app*. It does not gate a probe: a raw secret key signs its own 22242,
 * so the identity service is not in the path at all.
 *
 * `createLiveRelay` already expects this caller — its `sign` option is
 * documented "Peek passes `signViaEstivaId`; a keyed client passes a `signEvent`
 * wrapper". See `keyedSign` for the one wrinkle in being that client.
 *
 * ## Why it publishes nothing
 *
 * An idle subscription is idle *by construction*: its filter is a freshly
 * generated uuid `#h`, which no event in the workspace carries and none ever
 * will. So the cost phases hold real REQs open against the real relay without
 * writing a single event, and without reading anybody's data — the only frames
 * that cross are AUTH, REQ, EOSE and CLOSE.
 *
 * That matters for what has to be asked for. Membership (`buzz-admin
 * add-member`) is needed to *publish*, so the delivery-shape question needs it;
 * these phases may not. `auth` exists to find out which, rather than assuming.
 *
 * ## Measurement discipline
 *
 * PER-1's first agent measurement compared two versions minutes apart and
 * reported batching as *slower* when it was 34% faster: production relay
 * latency drifts by hundreds of milliseconds between runs. So every level is
 * measured in **one process**, round-robin, and reported as a **median** — a
 * single before/after pair is not evidence here.
 */
import { randomUUID } from 'node:crypto'
import {
  buildCreateChannel,
  buildMessage,
  createLiveRelay,
  publicKeyFromSecret,
  Relay,
  secretKeySigner,
  signEvent,
  type LiveRelay,
  type RelayState,
  type SignedEvent,
  type Subscription,
  type UnsignedEvent,
} from '@estiva-app/protocol'

const RELAY_URL = process.env.RELAY_URL ?? 'https://estiva.estiva.app'
const PHASE = process.argv[2] ?? 'auth'

/** Idle-subscription levels the ticket asks for. */
const LEVELS = [1, 34, 100]
const REPS = Number(process.env.REPS ?? 15)
/** REQ frames opened per second. `WsEvents` meters at 10/sec by default. */
const PACE = Number(process.env.PACE ?? 8)

/**
 * A fresh throwaway key per run — a prop, not a product.
 *
 * `PROBE_SECRET_KEY` overrides it, which is what makes this usable against a
 * relay running closed, where the author must already be a member and a key
 * invented at runtime never is. Same contract as `scripts/probe-kinds.ts`.
 */
function newIdentity() {
  const fromEnv = process.env.PROBE_SECRET_KEY?.trim()
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) {
      throw new Error('PROBE_SECRET_KEY must be 64 hex characters')
    }
    const secretKeyHex = fromEnv.toLowerCase()
    return { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
  }
  const secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  return { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
}

/**
 * The `sign` half of being a keyed consumer of `createLiveRelay`.
 *
 * `answerChallenge` builds the unsigned 22242 with `pubkey: ''` on purpose: a
 * remote `/sign` overwrites it with the token's subject, and `expectedPubkey`
 * is the check that it matched. A keyed client has to fill that field in
 * itself, because `signEvent` throws when `unsigned.pubkey` disagrees with the
 * key rather than producing an event the relay rejects as a bad signature.
 *
 * One line, and no change to the package — but it is the first friction a
 * second consumer has met on this API, so it belongs on SHA-7 either way.
 */
function keyedSign(secretKeyHex: string) {
  return async (
    unsigned: UnsignedEvent,
    _token: string,
    expectedPubkey: string,
  ): Promise<SignedEvent> => signEvent({ ...unsigned, pubkey: expectedPubkey }, secretKeyHex)
}

interface Session {
  relay: LiveRelay
  states: RelayState[]
  reasons: string[]
}

/**
 * One authenticated socket, or the relay's reason for refusing.
 *
 * The backoff is deliberately tiny and the attempt count capped: a refused AUTH
 * poisons its connection and `createLiveRelay` answers by reconnecting, so the
 * default shape would sit retrying against production for minutes to tell us
 * something it already knew on the first attempt.
 */
function connect(identity: { secretKeyHex: string; pubkey: string }): Promise<Session> {
  const states: RelayState[] = []
  const reasons: string[] = []
  let settled = false

  return new Promise<Session>((resolve, reject) => {
    const relay = createLiveRelay({
      url: RELAY_URL,
      // A raw key needs no token. The field is required by the type and
      // ignored by `keyedSign`; the relay never sees it either way.
      getCredential: () => ({ accessToken: 'unused-by-a-keyed-client', pubkey: identity.pubkey }),
      sign: keyedSign(identity.secretKeyHex),
      subscriptionPrefix: 'liv1-',
      backoff: { baseMs: 400, maxMs: 1200, jitter: () => 1 },
      onState: (state) => {
        states.push(state)
        if (state === 'live' && !settled) {
          settled = true
          resolve({ relay, states, reasons })
        }
        if (state === 'failed' && !settled) {
          settled = true
          relay.close()
          reject(new Error(`relay reached 'failed': ${reasons.join(' | ') || 'no reason logged'}`))
        }
      },
      log: (message, detail) => {
        const line = detail ? `${message} ${JSON.stringify(detail)}` : message
        reasons.push(line)
        if (process.env.VERBOSE) console.log('   [relay]', line)
      },
    })

    setTimeout(() => {
      if (settled) return
      settled = true
      relay.close()
      reject(new Error(`no 'live' within 30s; states: ${states.join(' -> ')}; ${reasons.join(' | ')}`))
    }, 30_000)
  })
}

/**
 * Folders this key owns, created once per run and reused by every level.
 *
 * The first draft of this filtered on a freshly generated uuid, on the theory
 * that a Folder with no events is idle by construction. `shape` proved that
 * wrong twice over: a single-`#h` REQ for a Folder you are not a member of is
 * answered `CLOSED restricted: not a channel member`, and a multi-`#h` REQ is
 * not channel-scoped at all. An idle subscription has to be a real Folder this
 * key belongs to — which is also the shape Ship will actually hold.
 */
async function makeFolders(identity: { secretKeyHex: string; pubkey: string }, n: number) {
  const bridge = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))
  const folders: string[] = []
  for (let i = 0; i < n; i++) {
    const folder = randomUUID()
    const result = await bridge.publish(
      signEvent(
        buildCreateChannel(identity.pubkey, Date.now(), {
          channelUuid: folder,
          name: `liv1 cost ${folder.slice(0, 8)}`,
        }),
        identity.secretKeyHex,
      ),
    )
    if (!result.ok) throw new Error(`could not create Folder ${i}: ${result.reason ?? 'refused'}`)
    folders.push(folder)
  }
  return folders
}

/** Channel-scoped and quiet: a real Folder of this key's, with nothing published into it. */
function idleFilter(folders: string[], i: number) {
  return { kinds: [9], '#h': [folders[i % folders.length]] }
}

/** Open `n` idle subscriptions and resolve once the relay has EOSE'd every one. */
async function openIdle(relay: LiveRelay, folders: string[], n: number): Promise<Subscription[]> {
  const subs: Subscription[] = []
  let seen = 0
  return await new Promise(async (resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`only ${seen}/${n} idle subscriptions EOSE'd within 30s`)),
      30_000,
    )
    for (let i = 0; i < n; i++) {
      // REQ is client->server, so it is metered on `WsEvents` (10/sec). Opening
      // a level's worth of subscriptions in one burst is refused outright — see
      // the `burst` phase for where the ceiling actually falls.
      if (i > 0 && i % PACE === 0) await new Promise((r) => setTimeout(r, 1_100))
      subs.push(
        relay.subscribe([idleFilter(folders, i)], () => {}, {
          onEose: () => {
            if (++seen === n) {
              clearTimeout(timer)
              resolve(subs)
            }
          },
          onClosed: (reason) => {
            clearTimeout(timer)
            reject(new Error(`idle subscription refused: ${reason}`))
          },
        }),
      )
    }
  })
}

/** REQ -> EOSE round trip on an already-live socket, in ms. The thing being timed. */
function roundTrip(relay: LiveRelay, folders: string[]): Promise<number> {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    let sub: Subscription | undefined
    const timer = setTimeout(() => {
      sub?.close()
      reject(new Error('no EOSE within 20s'))
    }, 20_000)
    sub = relay.subscribe([idleFilter(folders, 0)], () => {}, {
      onEose: () => {
        const ms = performance.now() - started
        clearTimeout(timer)
        sub?.close()
        resolve(ms)
      },
      onClosed: (reason) => {
        clearTimeout(timer)
        sub?.close()
        reject(new Error(`probe REQ refused: ${reason}`))
      },
    })
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function summarise(label: string, values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  console.log(
    `  ${label.padEnd(28)} n=${values.length}  median ${median(values).toFixed(1)}ms` +
      `  min ${sorted[0].toFixed(1)}  max ${sorted[sorted.length - 1].toFixed(1)}`,
  )
}

/**
 * Phase `auth`: can a non-member hold an authenticated socket and subscribe?
 *
 * The answer decides whether the cost phases need `buzz-admin add-member` at
 * all. Publishes nothing and reads nothing — AUTH, one REQ against a uuid that
 * matches no event, EOSE.
 */
async function phaseAuth(identity: { secretKeyHex: string; pubkey: string }) {
  console.log(`\nAUTH — can this key hold a socket and subscribe?`)
  console.log(`  relay   ${RELAY_URL}`)
  console.log(`  pubkey  ${identity.pubkey}`)
  console.log(`  member  ${process.env.PROBE_SECRET_KEY ? 'PROBE_SECRET_KEY supplied' : 'no — key invented at runtime'}`)

  let session: Session
  try {
    session = await connect(identity)
  } catch (error) {
    console.log(`\n  AUTH REFUSED`)
    console.log(`  ${(error as Error).message}`)
    console.log(`\n  => the cost phases need membership. Ask before add-member.`)
    return
  }

  console.log(`\n  reached 'live'  states: ${session.states.join(' -> ')}`)
  try {
    const folders = await makeFolders(identity, 1)
    const ms = await roundTrip(session.relay, folders)
    console.log(`  REQ -> EOSE accepted in ${ms.toFixed(1)}ms`)
    console.log(
      process.env.PROBE_SECRET_KEY
        ? `\n  => this key can AUTH and subscribe. It was supplied, so say nothing about non-members.`
        : `\n  => a key invented at runtime can AUTH and subscribe. This relay is open.`,
    )
  } catch (error) {
    console.log(`  REQ refused: ${(error as Error).message}`)
    console.log(`\n  => AUTH succeeds but subscribing does not. Membership gates reads.`)
  }
  session.relay.close()
}

/**
 * Phase `cost`: what do N idle subscriptions cost on one connection?
 *
 * Round-robin over the levels rather than one level at a time, so relay-side
 * drift lands on every level equally instead of on whichever ran last.
 */
async function phaseCost(identity: { secretKeyHex: string; pubkey: string }) {
  console.log(`\nCOST — REQ -> EOSE round trip while holding N idle subscriptions`)
  console.log(`  relay ${RELAY_URL}   levels ${LEVELS.join(', ')}   reps ${REPS}, round-robin, one process`)

  const distinct = Number(process.env.FOLDERS ?? Math.max(...LEVELS))
  const folders = await makeFolders(identity, distinct)
  console.log(`  ${distinct} throwaway Folders created; ${distinct < Math.max(...LEVELS) ? 'levels above that reuse them' : 'one per subscription'}`)

  const session = await connect(identity)
  const samples = new Map<number, number[]>(LEVELS.map((n) => [n, []]))
  const setupMs = new Map<number, number[]>(LEVELS.map((n) => [n, []]))

  for (let rep = 0; rep < REPS; rep++) {
    for (const n of LEVELS) {
      const openedAt = performance.now()
      const subs = await openIdle(session.relay, folders, n)
      setupMs.get(n)!.push(performance.now() - openedAt)
      samples.get(n)!.push(await roundTrip(session.relay, folders))
      for (const sub of subs) sub.close()
    }
    process.stdout.write(`\r  rep ${rep + 1}/${REPS}`)
  }
  console.log('')

  console.log(`\n  probe REQ -> EOSE, by idle subscriptions held:`)
  for (const n of LEVELS) summarise(`${n} idle`, samples.get(n)!)
  console.log(`\n  opening the idle subscriptions themselves:`)
  for (const n of LEVELS) summarise(`${n} REQs to EOSE`, setupMs.get(n)!)

  const base = median(samples.get(LEVELS[0])!)
  console.log(`\n  relative to ${LEVELS[0]} idle:`)
  for (const n of LEVELS) {
    const ratio = median(samples.get(n)!) / base
    console.log(`  ${String(n).padStart(4)} idle  ${ratio.toFixed(2)}x`)
  }

  session.relay.close()
}

/**
 * Phase `connections`: the same load spread across several connections.
 *
 * Ship will hold one. This is the control that says whether that is a choice
 * worth defending or merely tidy.
 */
async function phaseConnections(identity: { secretKeyHex: string; pubkey: string }) {
  const total = Number(process.env.TOTAL ?? 100)
  const counts = (process.env.CONNS ?? '1,4,10').split(',').map(Number)
  console.log(`\nCONNECTIONS — ${total} idle subscriptions spread across C connections`)
  console.log(`  relay ${RELAY_URL}   C in ${counts.join(', ')}   reps ${REPS}`)

  const folders = await makeFolders(identity, Number(process.env.FOLDERS ?? total))

  for (const c of counts) {
    const per = Math.floor(total / c)
    const sessions: Session[] = []
    const authMs: number[] = []
    for (let i = 0; i < c; i++) {
      const started = performance.now()
      sessions.push(await connect(identity))
      authMs.push(performance.now() - started)
    }
    const held: Subscription[][] = []
    for (const session of sessions) held.push(await openIdle(session.relay, folders, per))

    const rtt: number[] = []
    for (let rep = 0; rep < REPS; rep++) rtt.push(await roundTrip(sessions[0].relay, folders))

    console.log(`\n  C=${c}  (${per} idle each, ${per * c} total)`)
    summarise('connect + AUTH', authMs)
    summarise('probe REQ -> EOSE', rtt)

    for (const subs of held) for (const sub of subs) sub.close()
    for (const session of sessions) session.relay.close()
  }
}


/**
 * Phase `shape`: does one filter carrying N `#h` values actually deliver?
 *
 * PER-3 records this as settled — "One. Live tag matching is proper NIP-01 OR
 * (`filter_match_one` -> `tag_values.iter().any(...)`)". That predicate is real,
 * and it is the wrong half of the machinery to reason from: it is the *post*
 * match, applied to whatever fan-out already handed it.
 *
 * What decides delivery is which index the subscription was filed in.
 * `extract_channel_id_from_filters` (`handlers/req.rs:1013`) returns `None` when
 * "multiple distinct channel UUIDs appear across filters", so a wide filter
 * registers as a **global** subscription — `global_kind_index`. And
 * `fan_out_scoped` (`subscription.rs:265`) branches on the *event's*
 * `channel_id`, consulting `channel_kind_index` and `channel_wildcard_index`
 * for a channel event and the global indexes only in the `else`.
 *
 * Every Ship and Peek event carries an `h`, so it takes the first branch. If
 * that reading is right, a wide subscription is in no index fan-out will ever
 * consult for the events it asked for, and delivers **nothing** — a healthy
 * socket delivering silence, which is the failure this project keeps naming.
 *
 * So: run both paths against one relay, in one process, publishing only once
 * every subscription is live. `narrow` is the control. Without it a wide
 * delivering nothing is indistinguishable from a relay that is simply not
 * pushing.
 */
async function phaseShape(identity: { secretKeyHex: string; pubkey: string }) {
  const count = Number(process.env.FOLDERS ?? 3)
  const folders = Array.from({ length: count }, () => randomUUID())
  console.log(`\nSHAPE — one filter with ${count} #h values, against ${count} filters of one`)
  console.log(`  relay ${RELAY_URL}`)

  // The HTTP bridge publishes; `createLiveRelay` only reads. Same key for both,
  // so the socket is a member of every Folder it subscribes to.
  const bridge = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))
  for (const folder of folders) {
    const event = signEvent(
      buildCreateChannel(identity.pubkey, Date.now(), {
        channelUuid: folder,
        name: `liv1 probe ${folder.slice(0, 8)}`,
      }),
      identity.secretKeyHex,
    )
    const result = await bridge.publish(event)
    if (!result.ok) throw new Error(`could not create ${folder}: ${result.reason ?? 'refused'}`)
  }
  console.log(`  created ${count} throwaway Folders`)

  const session = await connect(identity)

  /** Historical (pre-EOSE) and live (post-EOSE) kept apart — the other half of the question. */
  interface Bucket {
    label: string
    historical: string[]
    live: string[]
    eosed: boolean
    closed?: string
  }
  const buckets: Bucket[] = []

  function track(label: string, filters: Record<string, unknown>[]): Bucket {
    const bucket: Bucket = { label, historical: [], live: [], eosed: false }
    buckets.push(bucket)
    session.relay.subscribe(
      filters,
      (event) => {
        const folder = event.tags.find((tag) => tag[0] === 'h')?.[1] ?? '?'
        ;(bucket.eosed ? bucket.live : bucket.historical).push(folder)
      },
      {
        onEose: () => {
          bucket.eosed = true
        },
        onClosed: (reason) => {
          bucket.closed = reason
        },
      },
    )
    return bucket
  }

  track('wide, kinds:[9]', [{ kinds: [9], '#h': folders }])
  track('wide, kindless', [{ '#h': folders }])
  for (const folder of folders) {
    track(`narrow ${folder.slice(0, 8)}`, [{ kinds: [9], '#h': [folder] }])
  }

  // Let every REQ reach EOSE before a single event exists, so anything that
  // arrives afterwards was pushed rather than queried.
  await new Promise((resolve) => setTimeout(resolve, 3_000))
  const notEosed = buckets.filter((b) => !b.eosed && !b.closed).map((b) => b.label)
  if (notEosed.length) console.log(`  warn: no EOSE for ${notEosed.join(', ')}`)

  console.log(`  publishing one kind:9 into each Folder...`)
  for (const folder of folders) {
    const event = signEvent(
      buildMessage(identity.pubkey, Date.now(), { channelUuid: folder, content: 'liv1 probe' }),
      identity.secretKeyHex,
    )
    const result = await bridge.publish(event)
    if (!result.ok) throw new Error(`could not publish into ${folder}: ${result.reason ?? 'refused'}`)
    // WsEvents meters at 10/sec; this is HTTP, but pace it anyway.
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  await new Promise((resolve) => setTimeout(resolve, 5_000))

  console.log(`\n  what each subscription received (${count} events published, one per Folder):`)
  for (const bucket of buckets) {
    const status = bucket.closed
      ? `CLOSED — ${bucket.closed}`
      : `live ${bucket.live.length}/${bucket.label.startsWith('wide') ? count : 1}` +
        `  (historical ${bucket.historical.length}${bucket.eosed ? '' : ', no EOSE'})`
    console.log(`  ${bucket.label.padEnd(22)} ${status}`)
  }

  const wide = buckets.find((b) => b.label === 'wide, kinds:[9]')!
  const narrowTotal = buckets
    .filter((b) => b.label.startsWith('narrow'))
    .reduce((sum, b) => sum + b.live.length, 0)
  console.log(`\n  wide delivered ${wide.live.length} of ${count}; the ${count} narrow subscriptions delivered ${narrowTotal} of ${count}.`)
  if (wide.live.length === count) {
    console.log(`  => one filter with N #h values DOES deliver live. PER-3's plan stands.`)
  } else if (narrowTotal === count) {
    console.log(`  => one filter with N #h values delivers ${wide.live.length}/${count} while narrow delivers all.`)
    console.log(`     A wide subscription is not in an index fan-out consults. PER-3 needs one subscription per Folder.`)
  } else {
    console.log(`  => neither path delivered; the relay pushed nothing at all. Inconclusive, not a finding.`)
  }

  session.relay.close()
}


/**
 * Phase `backfill`: does a wide filter work for the *historical* read?
 *
 * `shape` publishes after EOSE, so it only ever measures live push. This
 * publishes first and subscribes second, which is the transition Ship meets on
 * every reconnect — Peek calls it `backfill`.
 *
 * The distinction matters for how this was missed. Historical delivery runs
 * through a query, not through `fan_out_scoped`, so a wide filter can be
 * perfectly correct for a read and deliver nothing live. PER-1 batched Ship's
 * *reads* into multi-filter `/query` calls and they work — which is exactly the
 * evidence that would make a wide live filter look already proven.
 */
async function phaseBackfill(identity: { secretKeyHex: string; pubkey: string }) {
  const count = Number(process.env.FOLDERS ?? 3)
  const folders = Array.from({ length: count }, () => randomUUID())
  console.log(`\nBACKFILL — publish first, then subscribe. ${count} Folders`)
  console.log(`  relay ${RELAY_URL}`)

  const bridge = new Relay(RELAY_URL, secretKeySigner(identity.secretKeyHex))
  for (const folder of folders) {
    await bridge.publish(
      signEvent(
        buildCreateChannel(identity.pubkey, Date.now(), {
          channelUuid: folder,
          name: `liv1 backfill ${folder.slice(0, 8)}`,
        }),
        identity.secretKeyHex,
      ),
    )
    const message = await bridge.publish(
      signEvent(
        buildMessage(identity.pubkey, Date.now(), { channelUuid: folder, content: 'liv1 backfill' }),
        identity.secretKeyHex,
      ),
    )
    if (!message.ok) throw new Error(`publish into ${folder}: ${message.reason ?? 'refused'}`)
  }
  console.log(`  published one kind:9 into each of ${count} Folders, before any subscription existed`)

  // The HTTP bridge's own multi-filter read, as a second control: this is the
  // path PER-1 batched, and it is expected to work.
  const viaHttp = await bridge.query([{ kinds: [9], '#h': folders }])
  console.log(`  HTTP /query, one filter with ${count} #h: ${viaHttp.length} of ${count}`)

  const session = await connect(identity)

  function historical(label: string, filters: Record<string, unknown>[]): Promise<number> {
    return new Promise((resolve) => {
      let seen = 0
      let sub: Subscription | undefined
      const timer = setTimeout(() => {
        sub?.close()
        console.log(`  ${label.padEnd(22)} no EOSE within 15s, ${seen} received`)
        resolve(seen)
      }, 15_000)
      sub = session.relay.subscribe(
        filters,
        () => {
          seen++
        },
        {
          onEose: () => {
            clearTimeout(timer)
            sub?.close()
            resolve(seen)
          },
          onClosed: (reason) => {
            clearTimeout(timer)
            sub?.close()
            console.log(`  ${label.padEnd(22)} CLOSED — ${reason}`)
            resolve(-1)
          },
        },
      )
    })
  }

  const wide = await historical('wide, kinds:[9]', [{ kinds: [9], '#h': folders }])
  if (wide >= 0) console.log(`  ${'wide, kinds:[9]'.padEnd(22)} ${wide} of ${count} before EOSE`)
  let narrow = 0
  for (const folder of folders) {
    const got = await historical(`narrow ${folder.slice(0, 8)}`, [{ kinds: [9], '#h': [folder] }])
    if (got > 0) narrow += got
  }
  console.log(`  ${'narrow, summed'.padEnd(22)} ${narrow} of ${count} before EOSE`)

  console.log('')
  if (wide === count) {
    console.log(`  => a wide filter IS correct for the historical read. It fails only on live push,`)
    console.log(`     which is why batched /query reads look like proof that it works.`)
  } else if (wide === 0) {
    console.log(`  => a wide filter delivers nothing historical either.`)
  } else {
    console.log(`  => a wide filter delivered ${wide} of ${count} historical.`)
  }

  session.relay.close()
}


/**
 * Phase `burst`: how many subscriptions can be opened at once before refusal?
 *
 * `REQ` is a client->server frame, so it is metered on `LimitType::WsEvents` —
 * 10/sec by default. The project read that budget and concluded a socket costs
 * almost nothing, which is true of *delivery*: `connection.rs:600` meters only
 * client->server frames and pushed events are free.
 *
 * Establishing the subscriptions is not free, and it is a startup cost paid on
 * every connect and every reconnect. This finds the actual ceiling, because
 * Ship's 34 Folders sit somewhere near it: 36 unpaced REQs went through during
 * `shape`, 100 were refused with `rate-limited: quota exceeded`.
 */
async function phaseBurst(identity: { secretKeyHex: string; pubkey: string }) {
  console.log(`\nBURST — unpaced REQs on one connection until the relay refuses`)
  console.log(`  relay ${RELAY_URL}`)

  const folders = await makeFolders(identity, Number(process.env.FOLDERS ?? 4))
  const session = await connect(identity)

  let opened = 0
  let refusedAt: number | null = null
  let reason = ''
  const subs: Subscription[] = []

  await new Promise<void>((resolve) => {
    const ceiling = Number(process.env.CEILING ?? 300)
    for (let i = 0; i < ceiling; i++) {
      subs.push(
        session.relay.subscribe([idleFilter(folders, i)], () => {}, {
          onEose: () => {
            opened++
          },
          onClosed: (why) => {
            if (refusedAt === null) {
              refusedAt = opened + 1
              reason = why
            }
          },
        }),
      )
    }
    // One window is enough: a refusal lands within the same second.
    setTimeout(resolve, 8_000)
  })

  console.log(`  ${opened} subscriptions reached EOSE`)
  if (refusedAt === null) {
    console.log(`  no refusal up to ${subs.length} — the burst ceiling is above that`)
  } else {
    console.log(`  first refusal after ~${refusedAt}: ${reason}`)
    console.log(`\n  => Ship's 34 Folders are ${opened >= 34 ? 'inside' : 'OUTSIDE'} the unpaced burst ceiling.`)
    console.log(`     Subscribing has to be paced, on connect and on every reconnect.`)
  }

  for (const sub of subs) sub.close()
  session.relay.close()
}

const identity = newIdentity()

const phases: Record<string, (id: typeof identity) => Promise<void>> = {
  auth: phaseAuth,
  cost: phaseCost,
  connections: phaseConnections,
  shape: phaseShape,
  backfill: phaseBackfill,
  burst: phaseBurst,
}

const run = phases[PHASE]
if (!run) {
  console.error(`unknown phase '${PHASE}'. One of: ${Object.keys(phases).join(', ')}`)
  process.exit(2)
}

run(identity).then(
  () => process.exit(0),
  (error) => {
    console.error(`\n${PHASE} failed:`, (error as Error).message)
    process.exit(1)
  },
)
