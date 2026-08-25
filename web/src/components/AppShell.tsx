import type { ReactNode } from 'react'
import { HeaderBar } from './HeaderBar'

/**
 * The four regions that survived the old `index.html` once its 13,939 bytes
 * of CSS were taken away: header, banner, sidebar, main. Same grid as today —
 * a 240px rail beside a column that takes the rest — and the sidebar and main
 * scroll independently, so a long issue list never scrolls the rail away.
 *
 * Layout only. What goes in each region is the caller's; this component has
 * no data and no routes.
 */
export interface AppShellProps {
  /** The header's right-hand side — an `IdentityMenu`. */
  identity: ReactNode
  /** A `Banner`, or nothing. */
  banner?: ReactNode
  sidebar: ReactNode
  children: ReactNode
}

export function AppShell({ identity, banner, sidebar, children }: AppShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary">
      <HeaderBar identity={identity} />
      {banner}
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
