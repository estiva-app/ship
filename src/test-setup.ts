import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// `findBy…` and `waitFor` give up after 1 s by default, which a starved worker
// on a busy box misses with nothing wrong (2164b3d5). A real miss still fails.
configure({ asyncUtilTimeout: 5_000 })
