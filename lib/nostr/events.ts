/**
 * Buzz-shaped Nostr event builders.
 *
 * Every builder here mirrors a function in Buzz's own SDK
 * (`crates/buzz-sdk/src/builders.rs`) exactly — same kind, same tags, **same tag
 * order**. Tag order is part of the NIP-01 id preimage, so a reordered tag
 * produces a different event id. Where a shape was verified against Buzz's code,
 * the Rust function is named in the comment.
 *
 * Verified byte-identical to Buzz's own SDK output by running Buzz's crates over
 * this emitter's events.
 *
 * **Deliberately duplicated** from Peek's `convex/nostr/`. These demo apps are
 * meant to be independent implementations — if they imported Peek's code, "two
 * apps interoperating" would be a weaker claim than it looks. Keeping a separate
 * copy is the honest version, and it is only a few hundred lines.
 *
 * Pure functions only: no signing, no I/O, no randomness, so this runs anywhere
 * and is unit-testable. Signing lives in `./sign.ts`, which needs entropy.
 */
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

/** A Nostr tag: an array of strings whose first element is the tag name. */
export type NostrTag = string[]

/** An event before signing. `pubkey` is 64-char lowercase hex. */
export interface UnsignedEvent {
  pubkey: string
  created_at: number
  kind: number
  tags: NostrTag[]
  content: string
}

/** A signed event, ready to submit to the relay. */
export interface SignedEvent extends UnsignedEvent {
  id: string
  sig: string
}

/** Buzz kind numbers used by Peek (crates/buzz-core/src/kind.rs). */
export const KIND = {
  PROFILE: 0,
  HIGHLIGHT: 9802,
  /** NIP-FC File — see docs/buzz-compat/nips/NIP-FC.md in the Peek repo. */
  FILE: 30840,
  /** NIP-FC Component. */
  COMPONENT: 30841,
  DELETION: 5,
  REACTION: 7,
  STREAM_MESSAGE: 9,
  NIP29_PUT_USER: 9000,
  NIP29_CREATE_GROUP: 9007,
  HTTP_AUTH: 27235,
} as const

/** `build_reaction` (builders.rs:463) caps the emoji at 64 chars. */
export const MAX_EMOJI_CHARS = 64

/** kind:9 content cap — `check_content(content, 64 * 1024)` in build_message. */
export const MAX_MESSAGE_BYTES = 64 * 1024

/** `mention_tags` in builders.rs rejects more than this many mentions. */
export const MAX_MENTIONS = 50

/**
 * NIP-01 event id: sha256 over the canonical serialization
 * `[0, pubkey, created_at, kind, tags, content]`.
 *
 * `JSON.stringify` produces exactly the escaping NIP-01 requires (`\n`, `\"`,
 * `\\`, `\r`, `\t`, `\b`, `\f`, `\uXXXX` for other control chars) with no
 * insignificant whitespace, so no custom serializer is needed.
 */
export function computeEventId(e: UnsignedEvent): string {
  const serialized = JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])
  return bytesToHex(sha256(utf8ToBytes(serialized)))
}

/** Peek stores ms; Nostr `created_at` is seconds. */
export function toNostrSeconds(ms: number): number {
  return Math.floor(ms / 1000)
}

function assertHex64(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 64 lowercase hex chars, got: ${value.slice(0, 16)}…`)
  }
}

/**
 * Buzz's `canonical_channel_name` (crates/buzz-core/src/channel.rs:15):
 * strip leading '#' and whitespace, then trim the end. Applied by
 * `build_create_channel` before the name reaches the tag, so we must match it or
 * our ids diverge for any title with a leading '#' or space.
 */
export function canonicalChannelName(name: string): string {
  return name.replace(/^[#\s]+/, '').replace(/\s+$/, '')
}

/**
 * kind:0 profile — mirrors `build_profile` (builders.rs:537).
 *
 * Buzz builds the content with `serde_json::Map`, which is a `BTreeMap` unless
 * the `preserve_order` feature is enabled. It is not enabled in Buzz's
 * workspace, so **keys serialize in alphabetical order**: about, display_name,
 * name, nip05, picture. We sort to match; getting this wrong changes the content
 * string and therefore the event id.
 */
export function buildProfile(
  pubkey: string,
  createdAtMs: number,
  fields: {
    display_name?: string
    name?: string
    picture?: string
    about?: string
    nip05?: string
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const present = Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
  present.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const content = `{${present.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}`
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.PROFILE,
    tags: [],
    content,
  }
}

export type ChannelVisibility = 'open' | 'private'
export type ChannelKind = 'stream' | 'forum' | 'dm'

/**
 * kind:9007 create channel — mirrors `build_create_channel` (builders.rs:674).
 * Tag order is fixed: h, name, [visibility], [channel_type], [about], [ttl].
 */
export function buildCreateChannel(
  pubkey: string,
  createdAtMs: number,
  args: {
    channelUuid: string
    name: string
    visibility?: ChannelVisibility
    channelType?: ChannelKind
    about?: string
    ttlSeconds?: number
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const name = canonicalChannelName(args.name)
  if (name.trim() === '') throw new Error('channel name is required')
  const tags: NostrTag[] = [
    ['h', args.channelUuid],
    ['name', name],
  ]
  if (args.visibility) tags.push(['visibility', args.visibility])
  if (args.channelType) tags.push(['channel_type', args.channelType])
  if (args.about) tags.push(['about', args.about])
  if (args.ttlSeconds !== undefined) tags.push(['ttl', String(args.ttlSeconds)])
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.NIP29_CREATE_GROUP,
    tags,
    content: '',
  }
}

export type MemberRole = 'owner' | 'admin' | 'member'

/**
 * kind:9000 add member — mirrors `build_add_member` (builders.rs:565).
 * Tag order: h, p, [role]. The target pubkey is lowercased by Buzz.
 */
export function buildAddMember(
  pubkey: string,
  createdAtMs: number,
  args: { channelUuid: string; targetPubkey: string; role?: MemberRole },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const target = args.targetPubkey.toLowerCase()
  assertHex64(target, 'targetPubkey')
  const tags: NostrTag[] = [
    ['h', args.channelUuid],
    ['p', target],
  ]
  if (args.role) tags.push(['role', args.role])
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.NIP29_PUT_USER,
    tags,
    content: '',
  }
}

/**
 * kind:7 reaction — mirrors `build_reaction` (builders.rs:463).
 *
 * Note there is **no `h` tag**: Buzz derives the channel from the *target's*
 * `#e` tag and explicitly ignores a client-supplied `#h` (`NOSTR.md`). Adding one
 * would change the event id for no benefit.
 */
export function buildReaction(
  pubkey: string,
  createdAtMs: number,
  args: { targetEventId: string; emoji: string },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  assertHex64(args.targetEventId, 'targetEventId')
  if ([...args.emoji].length > MAX_EMOJI_CHARS) {
    throw new Error(`emoji longer than ${MAX_EMOJI_CHARS} chars`)
  }
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.REACTION,
    tags: [['e', args.targetEventId]],
    content: args.emoji,
  }
}

/**
 * kind:5 deletion — mirrors `build_remove_reaction` (builders.rs:495).
 *
 * Used to retract a reaction: Peek deletes the row, Nostr needs a tombstone.
 * Buzz accepts self-authored deletions (and an owner deleting their agent's).
 */
export function buildDeletion(
  pubkey: string,
  createdAtMs: number,
  args: { targetEventId: string },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  assertHex64(args.targetEventId, 'targetEventId')
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.DELETION,
    tags: [['e', args.targetEventId]],
    content: '',
  }
}

/** NIP-01 addressable reference: `<kind>:<pubkey>:<d-tag>`. */
export function addr(kind: number, pubkey: string, dTag: string): string {
  return `${kind}:${pubkey}:${dTag}`
}

/**
 * kind:30840 File — NIP-FC.
 *
 * `componentDTags` are listed **in document order**; order lives on the File so
 * reordering is a single edit in one place.
 */
export function buildFile(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** Stable File id. MUST NOT encode the relay or org — Files are portable. */
    fileId: string
    title: string
    componentDTags: string[]
    /** Channel scope. A File in a private channel inherits its access rules. */
    channelUuid?: string
    /** File-level metadata; shape is the app's business. */
    metadata?: Record<string, unknown>
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const tags: NostrTag[] = [
    ['d', args.fileId],
    ['title', args.title],
  ]
  if (args.channelUuid) tags.push(['h', args.channelUuid])
  for (const d of args.componentDTags) {
    tags.push(['a', addr(KIND.COMPONENT, pubkey, d)])
  }
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.FILE,
    tags,
    content: args.metadata ? JSON.stringify(args.metadata) : '',
  }
}

/**
 * kind:30841 Component — NIP-FC.
 *
 * `type` must be namespaced `<namespace>/<name>`. The protocol defines the
 * container; the payload shape belongs to the type.
 */
export function buildComponent(
  pubkey: string,
  createdAtMs: number,
  args: {
    componentId: string
    /** Parent File's `d` tag. */
    fileId: string
    /** Namespaced, e.g. `nfb/todo`. */
    type: string
    payload: Record<string, unknown>
    channelUuid?: string
    labels?: Label[]
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  if (!args.type.includes('/')) {
    throw new Error(`component type must be namespaced "<namespace>/<name>", got "${args.type}"`)
  }
  const tags: NostrTag[] = [
    ['d', args.componentId],
    ['a', addr(KIND.FILE, pubkey, args.fileId)],
    ['type', args.type],
  ]
  if (args.channelUuid) tags.push(['h', args.channelUuid])
  for (const label of args.labels ?? []) {
    tags.push(['L', label.namespace])
    tags.push(['l', label.value, label.namespace])
  }
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.COMPONENT,
    tags,
    content: JSON.stringify(args.payload),
  }
}

/** NIP-32 self-label: a namespace and a value, both indexable. */
export interface Label {
  /** Namespace, e.g. "nfb.highlight". */
  namespace: string
  /** Value within that namespace, e.g. "insight". */
  value: string
}

/**
 * kind:9802 highlight — NIP-84.
 *
 * `.content` is the excerpt itself. `e`/`a` tags point at a source event, `r` at
 * a URL; `p` attributes the original author.
 *
 * Optional NIP-32 `L`/`l` self-labels categorise the highlight. NIP-32 §52
 * allows those tags on non-1985 events for exactly this ("self-reporting"), so
 * a highlight can say *what kind* of highlight it is without a bespoke kind.
 */
export function buildHighlight(
  pubkey: string,
  createdAtMs: number,
  args: {
    /** The excerpt. */
    content: string
    /** Channel to post into (Buzz scopes by `h`). */
    channelUuid?: string
    /** Source event being highlighted. */
    sourceEventId?: string
    /** Source URL, when the highlight came from outside Nostr. */
    sourceUrl?: string
    /** Original author(s) of the highlighted material. */
    attribution?: string[]
    labels?: Label[]
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const tags: NostrTag[] = []
  if (args.channelUuid) tags.push(['h', args.channelUuid])
  if (args.sourceEventId) {
    assertHex64(args.sourceEventId, 'sourceEventId')
    tags.push(['e', args.sourceEventId])
  }
  if (args.sourceUrl) tags.push(['r', args.sourceUrl])
  for (const p of args.attribution ?? []) {
    const lower = p.toLowerCase()
    assertHex64(lower, 'attribution pubkey')
    tags.push(['p', lower, '', 'author'])
  }
  // NIP-32: the `L` namespace declaration precedes its `l` values.
  for (const label of args.labels ?? []) {
    tags.push(['L', label.namespace])
    tags.push(['l', label.value, label.namespace])
  }
  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.HIGHLIGHT,
    tags,
    content: args.content,
  }
}

/**
 * NIP-10 reply context.
 *
 * Mirrors Buzz's `ThreadRef` + `thread_tags` (builders.rs:173), which has a
 * detail that is easy to get wrong: for a **direct** reply (parent is the root)
 * Buzz emits a SINGLE tag marked `"reply"` — not a `"root"` tag. Only a nested
 * reply emits both. Getting this wrong changes the event id and, worse, produces
 * threads Buzz's clients read differently.
 */
export interface ThreadRef {
  /** Thread root event id (64-hex). */
  rootId: string
  /** Direct parent event id. Equal to `rootId` for a direct reply. */
  parentId: string
}

/** Exactly Buzz's `thread_tags` (builders.rs:173). */
export function threadTags(ref: ThreadRef): NostrTag[] {
  if (ref.rootId === ref.parentId) {
    return [['e', ref.rootId, '', 'reply']]
  }
  return [
    ['e', ref.rootId, '', 'root'],
    ['e', ref.parentId, '', 'reply'],
  ]
}

/**
 * kind:9 stream message — mirrors `build_message` (builders.rs:219).
 * Tag order: h, [thread tags], [p mentions], [broadcast], [imeta].
 *
 * **This is the shape verified byte-identical against Buzz's SDK** — see
 * docs/buzz-compat/INTEROP_PROOF.md §4.
 */
export function buildMessage(
  pubkey: string,
  createdAtMs: number,
  args: {
    channelUuid: string
    content: string
    threadRef?: ThreadRef
    /** Mentioned pubkeys (64-hex). Deduplicated, lowercased, capped at 50. */
    mentions?: string[]
    broadcast?: boolean
    /** Raw `imeta` tag vectors for media attachments. */
    mediaTags?: NostrTag[]
  },
): UnsignedEvent {
  assertHex64(pubkey, 'pubkey')
  const bytes = utf8ToBytes(args.content).length
  if (bytes > MAX_MESSAGE_BYTES) {
    throw new Error(`content is ${bytes} bytes, max ${MAX_MESSAGE_BYTES}`)
  }

  const tags: NostrTag[] = [['h', args.channelUuid]]

  if (args.threadRef) tags.push(...threadTags(args.threadRef))

  if (args.mentions && args.mentions.length > 0) {
    if (args.mentions.length > MAX_MENTIONS) {
      throw new Error(`too many mentions: ${args.mentions.length} > ${MAX_MENTIONS}`)
    }
    const seen = new Set<string>()
    for (const hex of args.mentions) {
      const lower = hex.toLowerCase()
      assertHex64(lower, 'mention pubkey')
      if (!seen.has(lower)) {
        seen.add(lower)
        tags.push(['p', lower])
      }
    }
  }

  if (args.broadcast) tags.push(['broadcast', '1'])
  for (const mt of args.mediaTags ?? []) tags.push(mt)

  return {
    pubkey,
    created_at: toNostrSeconds(createdAtMs),
    kind: KIND.STREAM_MESSAGE,
    tags,
    content: args.content,
  }
}
