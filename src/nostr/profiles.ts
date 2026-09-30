/**
 * Who a pubkey is: `kind:0` profiles, read from the relay.
 *
 * Nothing here is Estiva Ship's own idea of a person. A profile is NIP-01
 * metadata published by whichever app that key signs in — Peek publishes one
 * for every account it holds, and this app publishes one for its local key —
 * so reading `kind:0` is how one app renders another app's people without
 * sharing a database with it. It is the same lookup Peek does in the other
 * direction (`convex/nostr/sync.ts`), which is why a name typed here shows up
 * there and vice versa.
 *
 * Pure parsing plus a small in-memory directory. The fetch lives in `store.ts`.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { KIND } from './kinds'

/** A person, as the relay describes them. Every field is optional — a profile is free text. */
export interface Profile {
  pubkey: string
  /** Display name, already resolved from `display_name` or `name`. */
  name?: string
  /** Avatar URL, rendered as-is. */
  picture?: string
  /** Verifiable handle, `user@domain`. Buzz canonicalises these to the relay's domain. */
  nip05?: string
  about?: string
  /**
   * NIP-24's `bot: true` — an agent. What decides whether Edit and Delete are
   * offered on its messages (SPEC §6.5, CON-5): the viewer may be its owner.
   * `false` or absent for a profile that does not say so.
   */
  bot?: boolean
  /** `created_at`, kept so a later profile can replace an earlier one. */
  createdAt: number
}

/** A pubkey → profile lookup. */
export type Directory = Map<string, Profile>

/**
 * Parse a `kind:0` into a Profile, tolerating anything malformed.
 *
 * The content is a JSON blob written by some other app, which means it may be
 * truncated, may not be an object at all, and may hold numbers where strings
 * are expected. None of that is worth an exception: a profile that will not
 * parse simply leaves the author rendered as a key, which is exactly the
 * behaviour we had before profiles existed.
 *
 * `display_name` wins over `name` because Peek writes the former and this app
 * writes the latter, and a person who has both set in different apps should see
 * one of them rather than a coin flip.
 */
export function parseProfile(event: SignedEvent): Profile | null {
  if (event.kind !== KIND.PROFILE) return null
  let meta: Record<string, unknown>
  try {
    const parsed = JSON.parse(event.content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    meta = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const str = (key: string): string | undefined => {
    const value = meta[key]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  return {
    pubkey: event.pubkey,
    name: str('display_name') ?? str('name'),
    picture: str('picture'),
    nip05: str('nip05'),
    about: str('about'),
    bot: meta.bot === true,
    createdAt: event.created_at,
  }
}

/**
 * Build a directory from raw events, keeping the newest profile per key.
 *
 * The relay replaces `kind:0` on ingest, so in practice each author appears
 * once. This still picks a winner, for the same reason `latestPerAddress` does
 * in the fold: a query can return two versions after a replay or a race, and
 * choosing arbitrarily would make a name flicker between reloads. Newest
 * `created_at` wins, ties break on the lower id — NIP-01's own rule for
 * replaceable events.
 */
export function directoryFrom(events: SignedEvent[]): Directory {
  const directory: Directory = new Map()
  const ids = new Map<string, string>()
  for (const event of events) {
    const profile = parseProfile(event)
    if (!profile) continue
    const held = directory.get(profile.pubkey)
    if (
      held &&
      (held.createdAt > profile.createdAt ||
        (held.createdAt === profile.createdAt && (ids.get(profile.pubkey) ?? '') < event.id))
    ) {
      continue
    }
    directory.set(profile.pubkey, profile)
    ids.set(profile.pubkey, event.id)
  }
  return directory
}

/** Two initials for the avatar fallback: a name if we have one, else the key. */
export function initials(profile: Profile | undefined, pubkey: string): string {
  const words = profile?.name?.split(/\s+/).filter(Boolean) ?? []
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return pubkey.slice(0, 2).toUpperCase()
}
