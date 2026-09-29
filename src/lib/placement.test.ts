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

  it('is both when two states list it', () => {
    const other = { id: 'other', addresses: ['30850:x:listed'] }
    expect(placedIn({ addr: '30850:x:listed' }, [SHIP, other])).toEqual([SHIP, other])
  })
})
