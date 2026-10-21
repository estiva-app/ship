import { useEffect, useState } from 'react'
import { parentArchiveOf, type ForeignObject } from '@/api/foreign'

/**
 * Whether a linked file is archived with its parent, read once per reference
 * while `ask` holds: a card's values then read as words, as its page's do.
 */
export function useParentArchive(reference: string, ask: boolean): ForeignObject['archived'] | undefined {
  const [found, setFound] = useState<{ reference: string; archive: ForeignObject['archived'] | undefined }>()
  useEffect(() => {
    if (!ask) return
    let cancelled = false
    void parentArchiveOf(reference).then((archive) => {
      if (!cancelled) setFound({ reference, archive })
    })
    return () => {
      cancelled = true
    }
  }, [reference, ask])
  return found?.reference === reference ? found.archive : undefined
}
