import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

// `findBy…`, `waitFor` and `vi.waitFor` give up after 1 s by default, which a
// starved worker on a busy box misses with nothing wrong (2164b3d5). A real
// miss still fails. `vi.waitFor` has no config option, so its default is set here.
configure({ asyncUtilTimeout: 5_000 })
const waitFor = vi.waitFor
vi.waitFor = ((callback, options = {}) =>
  waitFor(callback, typeof options === 'number' ? options : { timeout: 5_000, ...options })) as typeof vi.waitFor
