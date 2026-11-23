import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { afterAll, vi } from 'vitest'

// `findBy…`, `waitFor` and `vi.waitFor` give up after 1 s by default, which a
// starved worker on a busy box misses with nothing wrong (2164b3d5). A real
// miss still fails. `vi.waitFor` has no config option, so its default is set here.
configure({ asyncUtilTimeout: 5_000 })
const waitFor = vi.waitFor
vi.waitFor = ((callback, options = {}) =>
  waitFor(callback, typeof options === 'number' ? options : { timeout: 5_000, ...options })) as typeof vi.waitFor

// The editor destroys itself on a 1 ms timer after it unmounts (estiva-ui `useBox`). A file whose last test unmounts
// one ends before that timer fires, and it then fires with the page torn down: "window is not defined", an unhandled
// error that fails the whole run (ship deploy 44795714048, ThreadList.resolve.test.tsx). Let timers already set fire
// first. Real timers only: a file still on a fake clock has nothing of the kind pending on the real one.
afterAll(async () => {
  if (vi.isFakeTimers()) vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, 20))
})
