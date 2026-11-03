import type { ReactNode } from 'react'

/**
 * The reading column of a page: 768px, centred, 52px under the tab row (Katerina, 29 September: Linear's gap; the
 * page gives 16px and `pt-9` adds 36), its blocks 16px apart (Katerina, 1 November). An issue's page has no tab row
 * since ONE-6, step 4d.
 */
export function Centred({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-9">{children}</div>
}
