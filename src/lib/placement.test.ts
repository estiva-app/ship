import { describe, expect, it } from 'vitest'
import { placedIn } from './placement'

const SHIP = { id: 'ship', addresses: ['30850:x:listed'] }
const PEEK = { id: 'peek' }

describe('placedIn — the sidebar’s rule, which the project rail names too', () => {
  it('is the Folder whose state lists the project, wherever its own Folder is', () => {
    expect(placedIn({ addr: '30850:x:listed', folder: 'peek' }, [SHIP, PEEK])).toEqual([SHIP])
  })

  it('falls back to its own Folder when no state lists it and that Folder is one of them', () => {
    expect(placedIn({ addr: '30850:x:new', folder: 'peek' }, [SHIP, PEEK])).toEqual([PEEK])
  })

  it('is none when nothing lists it and its own Folder is no top-level one — a re-linked record channel', () => {
    expect(placedIn({ addr: '30850:x:old', folder: 'record-channel' }, [SHIP, PEEK])).toEqual([])
    expect(placedIn({ addr: '30850:x:old' }, [SHIP, PEEK])).toEqual([])
  })

  it('is the team that lists it by its id, not its own Folder, once a move listed it by id (SHI-64)', () => {
    const author = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
    const addr = `30850:${author}:68589030-6e8d-41b7-8608-6cbb8bc342a6`
    const steer = { id: 'steer', addresses: [] }
    const building = { id: 'building', addresses: [], ids: ['68589030-6e8d-41b7-8608-6cbb8bc342a6'] }
    expect(placedIn({ addr, folder: 'steer' }, [steer, building])).toEqual([building])
  })

  it('is both when two states list it', () => {
    const other = { id: 'other', addresses: ['30850:x:listed'] }
    expect(placedIn({ addr: '30850:x:listed' }, [SHIP, other])).toEqual([SHIP, other])
  })
})
