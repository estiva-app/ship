/**
 * A nested list in a comment stays nested for the reader (PEE-57; SPEC §13.2):
 * the box writes a second-level item two spaces in, and Ship draws it inside
 * the item above it rather than as a line of text that splits the list.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { MessageText } from './MessageText'

describe('a comment with a second-level list item', () => {
  it('draws the item inside the one above it, and the next top-level item back out', () => {
    const c = render(<MessageText body={'- Agenda\n  - budget\n- Next'} />).container
    // Each item's own words, and how many items it sits inside.
    const depth = (li: Element) => {
      let n = 0
      for (let up = li.parentElement?.closest('li'); up; up = up.parentElement?.closest('li')) n += 1
      return n
    }
    const words = (li: Element) => {
      const own = li.cloneNode(true) as Element
      own.querySelectorAll('ul, ol').forEach((list) => list.remove())
      return own.textContent
    }
    expect([...c.querySelectorAll('li')].map((li) => [words(li), depth(li)])).toEqual([
      ['Agenda', 0],
      ['budget', 1],
      ['Next', 0],
    ])
  })
})
