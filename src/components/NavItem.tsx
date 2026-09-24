/**
 * Ship's nav row: the shared one, wired to Ship's router — SHI-20.
 *
 * The row itself moved to the package in 2026-09-02 and this file kept the
 * import path. It is a wrapper now, because the package's row renders a plain
 * anchor and cannot navigate: it does not know this app's router. That is
 * `NavItem.mdx`'s own instruction — "a router app keeps a thin wrapper" — and
 * Peek's `NavItem` is the same wrapper around `RailItem`.
 *
 * Left unwired it was a full page load per click, which is what emptied the
 * sidebar: the app restarted and the workspace was read from nothing.
 */
import { NavItem as SharedNavItem, type NavItemProps } from '@estiva-app/ui'
import { linkTo } from '@/router'

export type { NavItemProps }

export function NavItem({ href, ...rest }: NavItemProps) {
  return <SharedNavItem {...rest} {...linkTo(href)} />
}
