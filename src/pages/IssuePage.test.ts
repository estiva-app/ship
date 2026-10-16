// @vitest-environment jsdom
/**
 * An issue's History says a description was edited, never what it was set to
 * — RIC-15. A description's value is a whole document (a block tree since
 * RIC-8, marker text before) and printing it put several hundred characters
 * of JSON in a list meant to be skimmed. And no row prints a wire value: a
 * status by its label, a move by the project's title (564ee489).
 */
import { describe, expect, it } from 'vitest'
import type { ContentFormat } from '@estiva-app/protocol'
import type { DirectoryView, FolderState } from '@/api'
import type { Change } from '../nostr/fold'
import { historyFor } from './IssuePage'

const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const AUTHOR = 'b'.repeat(64)
const ASSIGNEE = 'c'.repeat(64)
const BLOCKS = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', id: '5f95b36d0ab3', content: [{ type: 'text', text: 'What we agreed' }] }] })

let seq = 0
const change = (field: string, value: string, format: ContentFormat = 'marker'): Change => ({
  id: `change-${++seq}`,
  author: AUTHOR,
  createdAt: 1_700_000_000 + seq,
  target: ISSUE,
  field,
  value,
  format,
  note: '',
})

const directory = {
  nameOf: (pubkey: string) => `name:${pubkey.slice(0, 4)}`,
  personOf: (pubkey: string) => ({ name: pubkey.slice(0, 8) }),
} as unknown as DirectoryView

const texts = (activity: Change[]) =>
  historyFor(ISSUE, { activity } as unknown as FolderState, directory).map((entry) => entry.text)

describe("an issue's History (RIC-15)", () => {
  it('says a block-document description was edited, with no JSON', () => {
    const [text] = texts([change('description', BLOCKS, 'blocks')])
    expect(text).toBe('edited the description')
    expect(text).not.toContain('{')
  })

  it('reads a marker-text description and a cleared one the same way', () => {
    expect(texts([change('description', 'What we agreed\n\n- one', 'marker'), change('description', '')])).toEqual([
      'edited the description',
      'edited the description',
    ])
  })

  it('says a summary was edited or removed, never its text (SPEC §6.12)', () => {
    expect(texts([change('summary', 'Totals are off by one cent.'), change('summary', ' ')])).toEqual([
      'edited the summary',
      'removed the summary',
    ])
  })
})

describe('no History row prints a wire value (564ee489)', () => {
  const PROJECT = `30850:${'d'.repeat(64)}:the-project`
  const projects = [{ addr: PROJECT, title: 'Rich text and blocks' }]
  const rows = (activity: Change[]) =>
    historyFor(ISSUE, { activity, projects } as unknown as FolderState, directory).map((entry) => entry.text)

  /* SHI-31: a membership change names the person, never the `member:<key>` field. */
  it('says joined, left and added, and leaves out a leave somebody else signed', () => {
    const by = (author: string, field: string, value: string) => ({ ...change(field, value), author })
    expect(rows([
      by(AUTHOR, `member:${AUTHOR}`, 'true'),
      by(AUTHOR, `member:${ASSIGNEE}`, 'true'),
      by(AUTHOR, `member:${ASSIGNEE}`, 'false'),
      by(AUTHOR, `member:${AUTHOR}`, 'false'),
    ])).toEqual(['left', `added name:${ASSIGNEE.slice(0, 4)}`, 'joined'])
  })

  it('says a status by its label', () => {
    expect(rows([change('status', 'in_progress'), change('status', 'done')])).toEqual(['set status to Done', 'set status to In Progress'])
  })

  it('names the project a move went to, and says a detach and a hidden target in words', () => {
    const texts = rows([change('project', PROJECT), change('project', ''), change('project', `30850:${'e'.repeat(64)}:elsewhere`)])
    expect(texts).toEqual(["moved it to a project you can't see", 'removed it from its project', 'moved it to Rich text and blocks'])
    expect(texts.join(' ')).not.toContain('30850:')
  })

  it('assigns and unassigns by name, and says an unassign with no earlier assignee', () => {
    expect(rows([change('assignee', ''), change('assignee', ASSIGNEE), change('assignee', '')])).toEqual([
      'unassigned name:cccc',
      'assigned name:cccc',
      'removed the assignee',
    ])
  })

  it('renames from the earlier title when the stream has one', () => {
    expect(rows([change('title', 'Board loses order'), change('title', 'Board columns lose order')])).toEqual([
      'renamed it from "Board loses order" to "Board columns lose order"',
      'renamed it to "Board loses order"',
    ])
  })

  it('archives and restores as verbs', () => {
    const texts = rows([change('archived', 'true'), change('archived', '')])
    expect(texts).toEqual(['restored it', 'archived it'])
    expect(texts.join(' ')).not.toMatch(/true|\(none\)/)
  })

  it('says a reference, and a field it has no words for, without "(none)"', () => {
    expect(rows([change('ref', 'SHI-4'), change('ref', ''), change('priority', 'high'), change('priority', '')])).toEqual([
      'cleared priority',
      'set priority to high',
      'removed its reference',
      'gave it the reference SHI-4',
    ])
  })
})
