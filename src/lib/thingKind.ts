import { referenceToPointer } from '@estiva-app/protocol'
import { thingKindOf, type ThingKind } from '@estiva-app/ui'

/**
 * What a `nostr:` pointer names, for the icon it wears (`KindIcon`): a
 * message's `nevent` or `note` is a message; an `naddr` is judged by its kind.
 * Anything else — a person, a pointer that does not decode — is none of these,
 * and `undefined` leaves the caller its own icon. The same answer Peek gives.
 */
export function thingKindOfUri(uri: string | null | undefined): ThingKind | undefined {
  if (!uri) return undefined
  if (/^nostr:(?:nevent1|note1)/i.test(uri)) return 'message'
  if (!/^nostr:naddr1/i.test(uri)) return undefined
  try {
    return thingKindOf(referenceToPointer(uri).kind)
  } catch {
    return undefined
  }
}
