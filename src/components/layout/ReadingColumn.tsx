import type { ReactNode } from 'react'

/**
 * The reading column Overview and Activity share: 768px, centred, 52px under
 * the tab row (Katerina, 29 September: Linear's Activity gap; the grid gives
 * 16px and `pt-9` adds 36).
 */
export function Centred({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-9">{children}</div>
}

/**
 * A section the app adds, as opposed to a heading someone typed: the type
 * ramp's h4, 16px semibold (Katerina, 29 September), and no count.
 */
export function AppSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" data-app-section={title}>
      <h2 className="flex h-8 items-center text-h4 text-text-primary">{title}</h2>
      {children}
    </section>
  )
}
