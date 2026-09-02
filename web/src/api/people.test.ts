import { describe, expect, it } from 'vitest'
import type { FolderState } from '../../../src/fold'
import { peopleIn, short } from './people'

const key = (c: string) => c.repeat(64)

const state: FolderState = {
  projects: [{ addr: 'p', id: 'p', author: key('a'), createdAt: 1, title: 'P', description: '', descriptionFormat: 'marker' as const, contentFolder: 'f', originFolder: 'f', lead: key('b'), status: 'planned', archived: false, fields: {} }],
  issues: [{ addr: 'i', id: 'i', author: key('c'), createdAt: 1, title: 'I', description: '', descriptionFormat: 'marker' as const, folder: 'f', status: 'todo', assignee: key('d'), fields: {} }],
  activity: [
    { id: 'x', author: key('e'), createdAt: 1, target: 'i', field: 'assignee', value: key('f'), note: '', format: 'marker' as const },
    { id: 'y', author: key('e'), createdAt: 1, target: 'i', field: 'status', value: 'done', note: '', format: 'marker' as const },
  ],
  conversations: [
    { id: 'm', root: { id: 'm', author: key('1'), createdAt: 1, body: '', folder: 'f', about: [] }, replies: [{ id: 'n', author: key('2'), createdAt: 2, body: '', folder: 'f', about: [] }], about: [], createdAt: 1, lastAt: 2 },
  ],
}

describe('peopleIn — the old app\'s participants rule, plus the viewer', () => {
  it('collects authors, leads, assignees, every voice in a thread and every actor, sorted', () => {
    expect(peopleIn(state, key('a'))).toEqual(['1', '2', 'a', 'b', 'c', 'd', 'e', 'f'].map(key))
  })

  it('always includes the viewer, first, when they appear nowhere', () => {
    expect(peopleIn(state, key('9'))[0]).toBe(key('9'))
  })

  it('does not mistake a status value for a person', () => {
    expect(peopleIn(state, key('a'))).not.toContain('done')
  })
})

describe('short', () => {
  it('shows eight characters and an ellipsis', () => {
    expect(short(key('a'))).toBe('aaaaaaaa…')
  })
})
