// @vitest-environment jsdom
/**
 * A project's Activity is where it was mentioned, and nothing else — PEE-26.
 *
 * CON-9 rolled the project's issue threads up into Activity as a `sub-file`
 * relation. That was undone: an issue's comments are read on the issue. They
 * must also stay out of the project's own stream, which is what CON-9 bought
 * and PEE-26 keeps — so both halves are asserted here.
 */
import { findNaddrs, naddrToAddr, type SignedEvent } from '@estiva-app/protocol'
import { describe, expect, it } from 'vitest'
import { foldFolder } from '../../../src/fold'
import { anchorIndex } from '../../../src/references'
import type { WorkspaceState } from '../../../src/store'
import type { DirectoryView } from '@/api'
import { ACTIVITY_HORIZON, activityFor, subFileThreads } from './ProjectPage'

const FOLDER = 'ffffffff-0000-0000-0000-000000000000'
const PROJECT = `30850:${'a'.repeat(64)}:the-project`
const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const refs = (body: string) => findNaddrs(body).map((n) => naddrToAddr(n))

let seq = 0
const event = (id: string, tags: string[][], content = ''): SignedEvent =>
  ({
    id,
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000 + ++seq,
    kind: 1111,
    tags: [['h', FOLDER], ...tags],
    content,
    sig: 'x'.repeat(128),
  }) as SignedEvent

const onIssue = (id: string) => event(id, [['A', ISSUE], ['a', ISSUE], ['K', '30851']], 'On the issue.')
/** A comment on some other file that names the project. */
const mention = (id: string) => event(id, [['A', `30851:${'c'.repeat(64)}:elsewhere`], ['a', PROJECT]], 'See the project.')

function workspace(events: SignedEvent[]): WorkspaceState {
  return { ...foldFolder(events, refs), anchors: anchorIndex(events), edits: {}, attachments: {} } as WorkspaceState
}

const directory = {
  directory: {},
  nameOf: (pubkey: string) => pubkey.slice(0, 8),
  personOf: (pubkey: string) => ({ name: pubkey.slice(0, 8) }),
  profileOf: () => undefined,
} as unknown as DirectoryView

describe("a project's Activity (PEE-26)", () => {
  const state = workspace([onIssue('i1'), mention('m1')])

  it('holds the mention and not the comment on its issue', () => {
    const { items } = activityFor(PROJECT, state, directory)
    expect(items.map((i) => [i.thread.id, i.relation])).toEqual([['m1', 'mention']])
  })

  it("still keeps the issue's thread out of the project's stream", () => {
    expect([...subFileThreads(state, new Set([ISSUE]))]).toEqual(['i1'])
  })

  it('keeps every issue thread out of the stream, not only the most recent ACTIVITY_HORIZON', () => {
    const many = workspace(Array.from({ length: ACTIVITY_HORIZON + 5 }, (_, n) => onIssue(`i${n}`)))
    expect(subFileThreads(many, new Set([ISSUE])).size).toBe(ACTIVITY_HORIZON + 5)
  })
})
