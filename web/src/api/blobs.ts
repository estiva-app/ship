/**
 * Reading an attachment's bytes — CON-12.
 *
 * ## Why an `<img src>` does not work
 *
 * Media GET on the relay is **unconditionally authenticated**: `get_blob` calls
 * `authenticate_media_read` before it touches storage, so a request with no
 * `Authorization` header answers 401 rather than the bytes. An `img` tag sends
 * no header and cannot be given one, so the only way to draw an attachment is
 * to fetch it with a signed `kind:24242` and hand the browser an object URL.
 *
 * `fetchBlob` in `@estiva-app/protocol` is that fetch — shared, because Peek
 * has exactly the same problem with exactly the same relay and each of the ways
 * to get it wrong fails as a 401 that reads like a session problem.
 *
 * ## Caching, and why it is by URL
 *
 * A thread re-renders on every poll, and a message's files are stable — the
 * `url` is content-addressed, so the same URL is the same bytes forever
 * (`Cache-Control: immutable`, the relay agrees). One in-flight promise per URL
 * therefore also collapses the burst of identical requests a first render makes.
 *
 * Object URLs are **not revoked**. The blob has to outlive every card that
 * might draw it, this cache is the only reference to it, and a revoked URL
 * renders as a broken image — the ordinary way to get that wrong. The bound is
 * {@link CACHE_LIMIT}, past which nothing new is cached and fetches simply
 * repeat; a conversation shows a handful of images, and a page that has drawn
 * 64 distinct files is one somebody scrolled a long way through.
 */
import { fetchBlob } from '@estiva-app/protocol'
import { RELAY_URL } from '../config'
import { signer } from './store'

/** Distinct blobs held as object URLs before new ones stop being cached. */
export const CACHE_LIMIT = 64

const cache = new Map<string, Promise<string>>()

/**
 * An object URL for one attachment, fetched with the viewer's authorization.
 *
 * Rejects rather than resolving to a placeholder: the caller draws the failure,
 * and a silent placeholder would make "you cannot read this channel" look
 * identical to "there is no image".
 */
export function blobObjectUrl(mediaUrl: string): Promise<string> {
  const held = cache.get(mediaUrl)
  if (held) return held

  const pending = fetchBlob({
    relayUrl: RELAY_URL,
    url: mediaUrl,
    sign: (unsigned) => signer.sign(unsigned),
    pubkey: signer.pubkey,
  }).then(({ bytes, contentType }) => URL.createObjectURL(new Blob([bytes], { type: contentType })))

  // A failure is not cached: the usual cause is an expired token, and the next
  // render is exactly when a renewed one would work.
  pending.catch(() => cache.delete(mediaUrl))
  if (cache.size < CACHE_LIMIT) cache.set(mediaUrl, pending)
  return pending
}

/** Test seam — the cache is module state and a suite must not inherit it. */
export function clearBlobCache(): void {
  cache.clear()
}
