import type { ReactNode } from 'react'
import { decodeNpub } from '@estiva-app/protocol'
import { InlineChip, WithTooltip } from '@estiva-app/ui'

/**
 * A person named in text — a `nostr:npub` reference (SPEC §13.1), drawn as the
 * package's person chip with the name the workspace directory gives.
 *
 * Every other reference is a file or a message, and draws as the kit's
 * `LinkChip` (`MessageChip`), in a box being written in too (Katerina, 30 Oct,
 * widget review 16 and 52): the kit has no kind for a person, so this is what
 * stays of Ship's own chip — what only Ship knows, its directory's names.
 *
 * - **Named**: `@Ada Lovelace`, in the urgent tone for someone the message
 *   names urgently (`urgent`, CON-24), as in the box it was written in.
 * - **Nobody to name**: a short key, quiet, the whole address on hover. Never
 *   blank (§13.1), and never the 64-hex key.
 *
 * A person stays a label: Ship has no page for one.
 */
export function Reference({
  uri,
  nameOf,
  urgent,
}: {
  uri: string
  /** The workspace directory, for a person. */
  nameOf?: (pubkey: string) => string
  /** The keys the message names urgently — its `["urgent", <pubkey>]` tags (SPEC §13.1). */
  urgent?: readonly string[]
}) {
  const short = `${uri.replace(/^nostr:/, '').slice(0, 12)}…`
  let pubkey: string | null = null
  if (/^nostr:npub1/i.test(uri)) {
    try {
      pubkey = decodeNpub(uri)
    } catch {
      pubkey = null
    }
  }
  const name = pubkey ? nameOf?.(pubkey) : undefined
  const named = !!name && !pubkey?.startsWith(name.replace('…', ''))
  const chip = (
    <InlineChip
      tone={named ? (pubkey && urgent?.includes(pubkey) ? 'urgent' : 'person') : 'quiet'}
      data-reference="person"
      data-mention={pubkey ?? undefined}
      data-resolved={named ? 'true' : 'false'}
    >
      {named ? `@${name}` : (name ?? short)}
    </InlineChip>
  )
  // Nobody to name: the whole address, on hover.
  return named ? chip : <Hint label={uri}>{chip}</Hint>
}

/**
 * The package's tooltip around a chip (UIG-14): the full words on hover.
 * `inline`, because a chip is a word in a sentence and a paragraph cannot hold
 * the `<div>` wrapper; the tooltip wraps at 320px, so a whole address stays on
 * screen.
 */
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <WithTooltip inline label={label}>
      {children}
    </WithTooltip>
  )
}
