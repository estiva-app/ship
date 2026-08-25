import { useEffect, useState } from 'react'
import { parse, type Route } from '../../apps/ship/router'

/**
 * The hash router, reused from the old app in place rather than moved or
 * copied: it is pure, it is tested (scripts/app.test.ts), and every route it
 * defines — including the inbound `#/o/<naddr>` that Peek's "open in Ship"
 * links carry — must survive the rewrite byte for byte. One copy, the old app
 * untouched, no Docker change. REW-9 moves the file here when the old app is
 * deleted.
 */
export { go, href, parse, replace, type ProjectView, type Route } from '../../apps/ship/router'

/** The current route, updated on every hash change. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const fire = () => setRoute(parse(location.hash))
    addEventListener('hashchange', fire)
    fire()
    return () => removeEventListener('hashchange', fire)
  }, [])
  return route
}
