/**
 * Read state on the relay, Ship's half — NIP-RS (CRO-8).
 *
 * Peek publishes these already. Until Ship does, Peek is only syncing with
 * itself across devices — useful, and not the point. The point is that reading
 * an issue's discussion here stops the corresponding Peek conversation being
 * unread.
 *
 * Ship is well placed for it: it reads the relay directly, folds client-side,
 * and has **no database to reconcile**. So the merged NIP-RS state can simply
 * *be* its read state, with none of the cache-versus-source-of-truth question
 * Peek needed a whole ticket (CRO-6) for.
 *
 * ## Where this lives, and where it must not
 *
 * Inside `api/`, because it needs the relay and the signer and this seam's rule
 * is that nothing outside it sees either.
 *
 * Explicitly **not** in `src/`, which `estiva-agent` vendors by copy at
 * identical paths and `scripts/conformance.test.ts` holds to it. A browser-only
 * client — `localStorage` slots, an Estiva ID session — has no business in a
 * CLI, and putting it there would force a copy that then drifts, which is the
 * exact failure PEEK-165 found.
 *
 * ## The ticket predates the rewrite, and predates the convention
 *
 * Two things in CRO-8's description are stale, both because it was filed before
 * the work it depends on:
 *
 * **It says `h:<folder-uuid>` for a project's Folder.** SPEC §11.1, written by
 * CRO-3 afterwards, fixes the container context as the **bare** channel uuid and
 * makes prefixing it a MUST NOT. That is not a style point: blobs are grow-only,
 * so a prefixed key published once is permanent, and Peek writes the bare form —
 * a prefixed one here would mean the two apps never agree about any container,
 * silently, forever.
 *
 * **It says to check whether the React rewrite is underway.** It is: `apps/` is
 * gone and `web/` is the app. So this is written once, here.
 *
 * ## The mapping, which is the part the ticket says to get right
 *
 * | Ship object | context | why |
 * | --- | --- | --- |
 * | project | its Folder's channel uuid, **bare** | a project *is* a container |
 * | an issue's discussion | `thread:<root event id>` | an issue is an object *inside* a Folder, not a container of its own |
 *
 * Using a container context for an issue would make reading one issue mark the
 * **whole project** read — SPEC §11.2, and the failure the write discipline
 * exists to prevent.
 *
 * ## Duplication, knowingly
 *
 * This is an independent implementation of Peek's client, per the README's
 * argument that apps here are independent rather than siblings sharing a
 * package. That argument is comfortable for a *fold* and less so here: two apps
 * that disagree about a context id do not fail, they just never see each other's
 * read state. So the grammar below is pinned by tests mirroring Peek's, and it
 * is the first thing that should move into `@estiva-app/protocol` when a third
 * app needs it.
 */
import type { Relay, SignedEvent, UnsignedEvent } from '@estiva-app/protocol'
import type { Signer } from '../../../lib/nostr/signer'

/** NIP-78 / NIP-RS. Ship's Estiva ID ceiling carries it (CRO-2). */
export const APP_DATA_KIND = 30078

/** NIP-RS's own `t` tag — what a reader of any app filters on. */
export const READ_STATE_TAG = 'read-state'

/** The `d`-tag prefix the relay's NIP-RS predicate keys on (SPEC §11.6). */
export const READ_STATE_D_PREFIX = 'read-state:'

/** Limits from NIP-RS and the reference implementation (SPEC §11.6). */
export const MAX_CONTEXTS = 10_000
export const MAX_CONTEXT_ID_BYTES = 256
export const MAX_TIMESTAMP = 4_294_967_295

/** Ship's slot, kept apart from anything else this app stores. */
export const SLOT_STORAGE_KEY = 'ship.readstate.slot'

/**
 * Ship's fetch horizon, in days.
 *
 * Wider than the reference default of 7, for the same reason as Peek's: the
 * relay stores the events anyway, and a project untouched for a month would
 * otherwise read as never-read. Ship has **no cache behind the protocol**, so
 * unlike Peek the horizon is the only thing covering that — which is an argument
 * for being generous rather than clever.
 */
export const HORIZON_DAYS = 90

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EVENT_ID_RE = /^[0-9a-f]{64}$/
const SLOT_ID_RE = /^[0-9a-f]{32}$/

// ---------------------------------------------------------------------------
// Context identifiers — SPEC §11.1
// ---------------------------------------------------------------------------

/**
 * A project's container context: its Folder's channel uuid, **bare**.
 *
 * Returns `undefined` rather than coercing. The input is a `Project.contentFolder`
 * and is normally a uuid, but a project re-pointed by a `kind:1851` could carry
 * anything — and an unparseable identifier in a grow-only blob is permanent.
 */
export function projectContext(contentFolder: string | null | undefined): string | undefined {
  if (!contentFolder) return undefined
  const value = contentFolder.toLowerCase()
  return UUID_RE.test(value) ? value : undefined
}

/**
 * An issue's discussion: `thread:<root event id>`.
 *
 * Takes a conversation's root id, not an issue address, because an issue is not
 * a container and has no context of its own. An issue with three discussions has
 * three thread contexts — reading one does not mark the others read, which is
 * the behaviour a reader would expect and the one §11.2 requires.
 */
export function threadContext(rootEventId: string | null | undefined): string | undefined {
  if (!rootEventId) return undefined
  const value = rootEventId.toLowerCase()
  return EVENT_ID_RE.test(value) ? `thread:${value}` : undefined
}

/** A single comment: `msg:<event id>`. */
export function messageContext(eventId: string | null | undefined): string | undefined {
  if (!eventId) return undefined
  const value = eventId.toLowerCase()
  return EVENT_ID_RE.test(value) ? `msg:${value}` : undefined
}

/** Is this a context id worth putting in a grow-only blob? */
export function isPublishableContextId(id: string): boolean {
  if (id.length === 0) return false
  if (new TextEncoder().encode(id).length > MAX_CONTEXT_ID_BYTES) return false
  if (id.startsWith('thread:')) return EVENT_ID_RE.test(id.slice('thread:'.length))
  if (id.startsWith('msg:')) return EVENT_ID_RE.test(id.slice('msg:'.length))
  return UUID_RE.test(id)
}

/** Epoch ms → the unix seconds NIP-RS stores, clamped to its integer range. */
export function toContextSeconds(atMs: number): number {
  const seconds = Math.floor(atMs / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(seconds, MAX_TIMESTAMP)
}

// ---------------------------------------------------------------------------
// Slot identity
// ---------------------------------------------------------------------------

export interface SlotIdentity {
  slotId: string
  clientId: string
}

function randomHex(bytes: number): string {
  const out = new Uint8Array(bytes)
  crypto.getRandomValues(out)
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Ship's slot, minted once and reused.
 *
 * **Distinct from Peek's by construction**, and that is the design rather than
 * an untidiness: NIP-RS slots are per *installation*, and Ship-in-Chrome and
 * Peek-in-Chrome are two installations. The merge across them is what makes read
 * state follow the person instead of the app.
 *
 * `localStorage`, never `sessionStorage`. A slot that dies with the tab mints a
 * new one every session until the person passes the reference client's limit of
 * eight slots, at which point their oldest read state silently stops merging.
 */
export function loadSlotIdentity(storage: Storage | undefined = safeStorage()): SlotIdentity {
  const fresh = (): SlotIdentity => ({ slotId: randomHex(16), clientId: `ship-${randomHex(4)}` })
  if (!storage) return fresh()
  try {
    const raw = storage.getItem(SLOT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SlotIdentity>
      if (
        typeof parsed.slotId === 'string' &&
        SLOT_ID_RE.test(parsed.slotId) &&
        typeof parsed.clientId === 'string' &&
        parsed.clientId.length >= 1 &&
        parsed.clientId.length <= 64
      ) {
        return { slotId: parsed.slotId, clientId: parsed.clientId }
      }
    }
  } catch {
    // Unreadable or unparseable — mint a new one rather than fail the read.
  }
  const identity = fresh()
  try {
    storage.setItem(SLOT_STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // Storage blocked (private mode, blocked site data). An ephemeral slot
    // publishes read state that will not be found again — worse than nothing,
    // better than taking the app down.
  }
  return identity
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** `read-state:<slot-id>` — the `d` tag the relay's NIP-RS predicate matches. */
export function readStateDTag(slotId: string): string {
  if (!SLOT_ID_RE.test(slotId)) throw new Error(`slot id must be 32 lowercase hex, got "${slotId}"`)
  return `${READ_STATE_D_PREFIX}${slotId}`
}

// ---------------------------------------------------------------------------
// The blob
// ---------------------------------------------------------------------------

export interface ReadStateBlob {
  v: 1
  client_id: string
  contexts: Record<string, number>
}

/** Parse a decrypted blob, dropping entries it cannot trust and keeping the rest. */
export function parseReadStateBlob(plaintext: string | undefined): ReadStateBlob | undefined {
  if (!plaintext) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const blob = raw as Partial<ReadStateBlob>
  // An unknown version is not read with v1 rules. The blob is grow-only, so a
  // guess about what v2 added would be permanent.
  if (blob.v !== 1) return undefined
  const clientId =
    typeof blob.client_id === 'string' && blob.client_id.length >= 1 && blob.client_id.length <= 64
      ? blob.client_id
      : ''
  const contexts: Record<string, number> = {}
  const source = typeof blob.contexts === 'object' && blob.contexts !== null ? blob.contexts : {}
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!isPublishableContextId(key)) continue
    if (typeof value !== 'number' || !Number.isInteger(value)) continue
    if (value < 0 || value > MAX_TIMESTAMP) continue
    contexts[key] = value
  }
  return { v: 1, client_id: clientId, contexts }
}

/** Serialize for encryption. Sorted keys, so an unchanged set is an unchanged string. */
export function serializeReadStateBlob(blob: ReadStateBlob): string {
  const contexts: Record<string, number> = {}
  for (const key of Object.keys(blob.contexts).sort()) contexts[key] = blob.contexts[key]
  return JSON.stringify({ v: blob.v, client_id: blob.client_id, contexts })
}

/**
 * Apply markers to a context map, taking the later of the two.
 *
 * §11.4: a client MUST NOT lower a timestamp. The merge rule is a maximum, so a
 * lower value is not merely ignored — it cannot be expressed. There is no
 * mark-as-unread in NIP-RS, and writing a smaller number is not a way to get one.
 */
export function advanceContexts(
  current: Readonly<Record<string, number>>,
  updates: Readonly<Record<string, number>>,
): Record<string, number> {
  const next: Record<string, number> = { ...current }
  for (const [id, seconds] of Object.entries(updates)) {
    if (!isPublishableContextId(id)) continue
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_TIMESTAMP) continue
    if (next[id] === undefined || seconds > next[id]) next[id] = seconds
  }
  const keys = Object.keys(next)
  if (keys.length <= MAX_CONTEXTS) return next
  // Drop the oldest rather than refuse the write: otherwise somebody who has
  // read 10,000 things can never mark anything read again.
  const kept: Record<string, number> = {}
  for (const id of keys.sort((a, b) => next[b] - next[a]).slice(0, MAX_CONTEXTS)) kept[id] = next[id]
  return kept
}

/** The frontier across every slot this person owns. */
export function mergeBlobs(blobs: readonly ReadStateBlob[]): Record<string, number> {
  let merged: Record<string, number> = {}
  for (const blob of blobs) merged = advanceContexts(merged, blob.contexts)
  return merged
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/**
 * The unsigned `kind:30078` carrying one slot's read state.
 *
 * **Exactly one `d` and exactly one `["t","read-state"]`** — SPEC §11.6 makes
 * the relay's handling a narrow predicate on that shape, and an event that
 * misses it is *not rejected*. It is stored as an ordinary addressable event,
 * which reads as a successful publish and is merged by nobody.
 *
 * **No `h`.** The kind is global; an explicit `h` would scope it into a channel
 * and it would answer `#h` queries it has no business answering.
 */
export function buildReadStateEvent(
  pubkey: string,
  nowMs: number,
  slotId: string,
  ciphertext: string,
): UnsignedEvent {
  return {
    pubkey,
    created_at: Math.floor(nowMs / 1000),
    kind: APP_DATA_KIND,
    tags: [
      ['d', readStateDTag(slotId)],
      ['t', READ_STATE_TAG],
    ],
    content: ciphertext,
  }
}

/** Every read-state slot **this person** owns, within the horizon. */
export function allSlotsFilter(
  pubkey: string,
  nowMs: number,
  horizonDays: number = HORIZON_DAYS,
): Record<string, unknown> {
  const since = toContextSeconds(nowMs) - Math.round(horizonDays * 24 * 60 * 60)
  return {
    kinds: [APP_DATA_KIND],
    authors: [pubkey],
    '#t': [READ_STATE_TAG],
    since: Math.max(0, since),
  }
}

/**
 * NIP-44 self-encryption, through Estiva ID.
 *
 * Ship holds no key either, so the encryption is a round trip like the signing
 * is. Injected rather than imported so the tests can exercise the client
 * without a network, and so the wiring owns the token.
 */
export interface Nip44 {
  encrypt: (plaintext: string) => Promise<string>
  decrypt: (ciphertext: string) => Promise<string | undefined>
}

/**
 * Read state, as far as the relay can tell us.
 *
 * `reachable: false` means the relay could not be asked, which is deliberately
 * not the same as "no slots". Collapsing them makes an unreachable relay read as
 * "you have read nothing" — the bug that shipped in Peek and had to be fixed
 * afterwards, where a first run could never publish because an empty answer and
 * a failed one were indistinguishable.
 */
export interface MergedReadState {
  reachable: boolean
  merged: Record<string, number>
  /** This installation's own blob, when the relay holds one. */
  own?: ReadStateBlob
}

/** Fetch every slot, decrypt what decrypts, and merge with the max rule. */
export async function fetchMergedReadState(
  relay: Pick<Relay, 'query'>,
  pubkey: string,
  nip44: Nip44,
  identity: SlotIdentity,
  nowMs: number = Date.now(),
): Promise<MergedReadState> {
  let events: SignedEvent[]
  try {
    events = await relay.query([allSlotsFilter(pubkey, nowMs)])
  } catch {
    return { reachable: false, merged: {} }
  }
  const blobs: ReadStateBlob[] = []
  let own: ReadStateBlob | undefined
  const ownDTag = readStateDTag(identity.slotId)
  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1]
    if (!dTag?.startsWith(READ_STATE_D_PREFIX)) continue
    // A blob that will not decrypt belongs to a rotated key. Skipped quietly,
    // per the spec: surfacing it turns "one old installation is unreadable"
    // into an error on a path whose whole job is a best-effort hint.
    const blob = parseReadStateBlob(await nip44.decrypt(event.content))
    if (!blob) continue
    blobs.push(blob)
    if (dTag === ownDTag) own = blob
  }
  return { reachable: true, merged: mergeBlobs(blobs), own }
}

/** Encrypt, sign and publish one slot's blob. */
export async function publishReadState(
  relay: Pick<Relay, 'publish'>,
  signer: Pick<Signer, 'pubkey' | 'sign'>,
  nip44: Nip44,
  identity: SlotIdentity,
  contexts: Record<string, number>,
  nowMs: number = Date.now(),
): Promise<{ ok: boolean; reason?: string }> {
  const blob: ReadStateBlob = { v: 1, client_id: identity.clientId, contexts }
  const ciphertext = await nip44.encrypt(serializeReadStateBlob(blob))
  const unsigned = buildReadStateEvent(signer.pubkey, nowMs, identity.slotId, ciphertext)
  const signed = await signer.sign(unsigned)
  const result = await relay.publish(signed)
  return { ok: result.ok, reason: result.reason }
}
