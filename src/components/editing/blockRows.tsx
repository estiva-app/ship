import { IconLink, IconMessage } from '@tabler/icons-react'
import { MenuItem, type HandleBlock } from '@estiva-app/ui'

/**
 * A link to one block of a description (RIC-18): the page's Overview, with
 * the block's §13.3 id as the fragment. A Ship URL, not a `nostr:` reference —
 * that is RFC 0.4 §6's question, and out of this ticket.
 */
const PREFIX = '#block-'

export function blockLink(id: string, at: Location = window.location): string {
  return `${at.origin}${at.pathname}${PREFIX}${encodeURIComponent(id)}`
}

/** The block a link opened this page at, if it did. */
export function linkedBlock(hash: string = window.location.hash): string | undefined {
  if (!hash.startsWith(PREFIX) || hash.length === PREFIX.length) return undefined
  // A pasted link cut mid-escape must open the page, not take it down.
  try {
    return decodeURIComponent(hash.slice(PREFIX.length))
  } catch {
    return undefined
  }
}

/**
 * Ship's rows in the block menu, after the editing ones: Copy link, and
 * Comment — which takes the person to the conversations with that block as
 * the new comment's anchor (Miky, RIC-18 kickoff). Offered to someone who
 * cannot edit too. A block without an id yet has nothing to address, so it
 * gets neither.
 */
export function blockRows(onComment?: (blockId: string) => void, onCopyLink?: (link: string) => void) {
  return (block: HandleBlock) => {
    const id = block.id
    if (!id) return null
    // The page's own copy, which says "Link copied" and falls back to a prompt; a story without one copies silently.
    const copy = onCopyLink ?? ((link: string) => void navigator.clipboard?.writeText(link))
    return (
      <>
        <MenuItem label="Copy link" leading={<IconLink size={16} stroke={1.5} className="text-text-secondary" />} onClick={() => copy(blockLink(id))} />
        {onComment && <MenuItem label="Comment" leading={<IconMessage size={16} stroke={1.5} className="text-text-secondary" />} onClick={() => onComment(id)} />}
      </>
    )
  }
}
