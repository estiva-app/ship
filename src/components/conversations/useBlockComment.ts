import { useState } from 'react'
import { resolveBlockAnchor, type BlockAnchor, type ContentFormat, type Imeta } from '@estiva-app/protocol'
import type { Picks } from '@/components/conversations/MessageBox'

type Start = (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<boolean | void> | boolean | void

/**
 * A block menu's Comment (RIC-18): the page goes to its Activity tab, where
 * the composer is, with that block as the new conversation's anchor (Miky,
 * kickoff: switch to the conversations; a comments sidebar is later). The
 * anchor is resolved against the description as it is now, so the composer
 * shows what the posted comment will.
 */
export function useBlockComment(description: string, format: ContentFormat, onTab: (tab: 'activity') => void, onStart: Start) {
  const [pending, setPending] = useState<string | null>(null)
  const anchor: BlockAnchor | undefined = pending ? resolveBlockAnchor(pending, description, format) : undefined
  return {
    anchor,
    start: (blockId: string) => {
      setPending(blockId)
      onTab('activity')
    },
    drop: () => setPending(null),
    post: async (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => {
      const posted = await onStart(text, files, picks, blockId)
      if (posted !== false) setPending(null)
      return posted
    },
  }
}
