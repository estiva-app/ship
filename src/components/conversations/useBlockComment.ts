import { useState } from 'react'
import { resolveBlockAnchor, type BlockAnchor, type ContentFormat, type Imeta } from '@estiva-app/protocol'
import type { Answer, Picks } from '@/components/conversations/shared'

type Start = (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => Promise<Answer>

/**
 * A block menu's Comment (RIC-18): the comments column is shown, if it was
 * hidden, with that block as the new comment's anchor above its box (ONE-6,
 * step 4c: the comments sidebar Miky's kickoff left for later; until then the
 * page went to its Activity tab). The anchor is resolved against the
 * description as it is now, so the box shows what the posted comment will.
 */
export function useBlockComment(description: string, format: ContentFormat, onShow: () => void, onStart: Start) {
  const [pending, setPending] = useState<string | null>(null)
  const anchor: BlockAnchor | undefined = pending ? resolveBlockAnchor(pending, description, format) : undefined
  return {
    anchor,
    start: (blockId: string) => {
      setPending(blockId)
      onShow()
    },
    drop: () => setPending(null),
    post: async (text: string, files: readonly Imeta[], picks?: Picks, blockId?: string) => {
      const posted = await onStart(text, files, picks, blockId)
      if (posted === true) setPending(null)
      return posted
    },
  }
}
