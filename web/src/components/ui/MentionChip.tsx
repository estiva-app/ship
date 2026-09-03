import { decodeNpub } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'

/**
 * A `nostr:npub…` in a body, drawn as the person it names — SPEC §13.1.
 *
 * **This is the claim RIC-2 is actually testing.** A mention written as a
 * display name is resolved against the writing app's own directory, so it
 * arrives here as plain text and Ship has no way to know it was a mention at
 * all. A key needs nothing shared: Ship's directory is already keyed by pubkey,
 * because Ship is Nostr-native, and the same key Peek wrote is the one Ship
 * looks up.
 *
 * `nameOf` is the workspace directory's, and it already falls back to a short
 * form of the key for somebody it does not know — which is what §13.1 requires
 * of a reader that cannot resolve a reference: "the URI's own label or its
 * shortened form, never blank". So a mention of somebody outside this workspace
 * still renders as a mention. It says *who* without saying what they are
 * called, which is the honest answer and one the display-name form could never
 * give at all.
 */
export function MentionChip({
  uri,
  nameOf,
  className,
}: {
  uri: string
  /** The workspace directory's lookup. Absent where a page has none. */
  nameOf?: (pubkey: string) => string
  className?: string
}) {
  let pubkey: string
  try {
    pubkey = decodeNpub(uri)
  } catch {
    // An naddr, a note, or something malformed. Objects referenced in a
    // description are drawn below it by `ForeignReferences`; there is nothing
    // to do here but leave the token as the author wrote it.
    return <>{uri}</>
  }

  const name = nameOf?.(pubkey)
  // `nameOf` returns a short key when it does not know somebody, so "resolved"
  // is whether it gave back an actual name rather than whether it answered.
  const resolved = !!name && !pubkey.startsWith(name.replace('…', ''))

  return (
    <span
      data-mention={pubkey}
      data-resolved={resolved ? 'true' : 'false'}
      title={resolved ? undefined : uri}
      className={cn(
        'mx-0.5 rounded-sm px-1 text-body-2',
        resolved ? 'bg-accent-muted text-accent-primary' : 'bg-bg-inset font-mono text-caption text-text-muted',
        className,
      )}
    >
      {resolved ? `@${name}` : (name ?? `${uri.replace(/^nostr:/, '').slice(0, 12)}…`)}
    </span>
  )
}
