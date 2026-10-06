// @vitest-environment jsdom
/**
 * An issue's History says a description was edited, never what it was set to
 * — RIC-15. A description's value is a whole document (a block tree since
 * RIC-8, marker text before) and printing it put several hundred characters
 * of JSON in a list meant to be skimmed. Every other field keeps its words.
 */
import { describe, expect, it } from 'vitest'
import type { DirectoryView, FolderState } from '@/api'
import { historyFor } from './IssuePage'

const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const AUTHOR = 'b'.repeat(64)
const ASSIGNEE = 'c'.repeat(64)
const BLOCKS = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', id: '5f95b36d0ab3', content: [{ type: 'text', text: 'What we agreed' }] }] })

let seq = 0
const change = (field: string, value: string, format?: 'blocks' | 'markdown') => ({
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

const texts = (activity: ReturnType<typeof change>[]) =>
  historyFor(ISSUE, { activity } as unknown as FolderState, directory).map((entry) => entry.text)

describe("an issue's History (RIC-15)", () => {
  it('says a block-document description was edited, with no JSON', () => {
    const [text] = texts([change('description', BLOCKS, 'blocks')])
    expect(text).toBe('edited the description')
    expect(text).not.toContain('{')
  })

  it('reads a marker-text description and a cleared one the same way', () => {
    expect(texts([change('description', 'What we agreed\n\n- one', 'markdown'), change('description', '')])).toEqual([
      'edited the description',
      'edited the description',
    ])
  })

  it('keeps every other field in words, newest first', () => {
    expect(texts([change('status', 'done'), change('assignee', ASSIGNEE), change('assignee', '')])).toEqual([
      'set assignee to (none)',
      'set assignee to name:cccc',
      'set status to done',
    ])
  })
})
