/**
 * Navigation is by kind; nesting is by intent — RFC 0.5 §10.7.
 *
 * Two claims, each pinned by a kind nobody designed for: the tree lists Ship's
 * kinds and only counts the rest, and Related is "not mine, under this" with
 * no list of expected kinds in it.
 */
import { describe, expect, it } from 'vitest'
import type { ForeignObject } from '@estiva-app/interop'
import { OWN_KINDS, relatedTo, splitByKind } from './ownKinds'

const file = (over: Partial<ForeignObject>): ForeignObject =>
  ({ ref: 'r', eventId: 'e', kind: 30850, widget: 'card', slots: {}, meta: [], comments: [], ...over }) as ForeignObject

const PROJECT = '30850:pk:proj'
const ISSUE = '30851:pk:iss'

describe('OWN_KINDS', () => {
  it('is exactly project and issue', () => {
    expect([...OWN_KINDS].sort()).toEqual([30850, 30851])
  })
})

describe('splitByKind', () => {
  it('lists projects and issues, and counts everything else — in the Folder’s order', () => {
    const files = [
      file({ ref: 't1', kind: 30840 }),
      file({ ref: 'p', kind: 30850 }),
      file({ ref: 'x', kind: 30911 }), // a kind nobody here has heard of
      file({ ref: 'i', kind: 30851 }),
      file({ ref: 't2', kind: 30840 }),
    ]
    const { own, foreign } = splitByKind(files)
    expect(own.map((f) => f.ref)).toEqual(['p', 'i'])
    expect(foreign.map((f) => f.ref)).toEqual(['t1', 'x', 't2'])
  })

  it('a folder of only foreign files is not empty — it is counted', () => {
    const { own, foreign } = splitByKind([file({ kind: 30840 }), file({ kind: 30840 })])
    expect(own).toHaveLength(0)
    expect(foreign).toHaveLength(2)
  })
})

describe('relatedTo', () => {
  it('is the foreign files whose parentRef is this object, any kind, and nothing else', () => {
    const files = [
      file({ ref: 'topic', kind: 30840, parentRef: PROJECT }),
      file({ ref: 'leaf', kind: 30911, parentRef: PROJECT }), // not special-cased to 30840
      file({ ref: 'elsewhere', kind: 30840, parentRef: '30850:pk:other' }),
      file({ ref: 'loose', kind: 30840 }), // in the Folder, under nothing
    ]
    expect(relatedTo(files, PROJECT).map((f) => f.ref)).toEqual(['topic', 'leaf'])
  })

  it('never lists Ship’s own children — an issue under the project is the Issues table’s', () => {
    const files = [file({ ref: 'i', kind: 30851, parentRef: PROJECT }), file({ ref: 't', kind: 30840, parentRef: PROJECT })]
    expect(relatedTo(files, PROJECT).map((f) => f.ref)).toEqual(['t'])
  })

  it('works for an issue as the parent, one level, no recursion', () => {
    // A sub-topic under the related topic names the topic, not the issue, and
    // so is not here: depth is the consumer's budget (MAX_LIST_DEPTH = 1).
    const files = [
      file({ ref: 't', kind: 30840, address: '30840:pk:t', parentRef: ISSUE }),
      file({ ref: 'sub', kind: 30840, parentRef: '30840:pk:t' }),
    ]
    expect(relatedTo(files, ISSUE).map((f) => f.ref)).toEqual(['t'])
  })
})
