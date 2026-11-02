import { useState } from 'react'

/** A thing the column beside the page holds, and the header's button that shows or hides it. */
export interface Shown {
  shown: boolean
  onShownChange: (shown: boolean) => void
}

/** What the column holds. */
export type Side = 'comments' | 'overview' | 'none'

/**
 * The column beside an issue's or a project's page holds one thing at a time: its comments, its Overview, or nothing
 * (Katerina, 2 November; ONE-6, step 4d). The comments are there when the page opens, and nothing is remembered.
 * Showing one puts the other away; hiding the Overview brings back what the column held before it, as Peek's side
 * panel gives a thread's column back. `start`: what it holds at first, for a story.
 */
export function useSideColumn(start: Side = 'comments'): { comments: Shown; overview: Shown } {
  const [{ side }, set] = useState<{ side: Side; before: 'comments' | 'none' }>({ side: start, before: 'comments' })
  return {
    comments: {
      shown: side === 'comments',
      onShownChange: (shown) => set((s) => ({ ...s, side: shown ? 'comments' : s.side === 'comments' ? 'none' : s.side })),
    },
    overview: {
      shown: side === 'overview',
      onShownChange: (shown) =>
        set((s) =>
          shown
            ? s.side === 'overview'
              ? s
              : { side: 'overview', before: s.side === 'comments' ? 'comments' : 'none' }
            : s.side === 'overview'
              ? { ...s, side: s.before }
              : s,
        ),
    },
  }
}
