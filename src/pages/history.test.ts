/**
 * A project's History (ONE-6): its own changes, newest first, in words, as an issue's are. It feeds the History
 * section of the Overview panel and "Edited … ago" over the page (step 4); nothing draws it yet.
 */
import { describe, expect, it } from 'vitest'
import type { Change, DirectoryView, FolderState } from '@/api'
import { PROJECT_STATUSES } from '@/nostr/kinds'
import { editedFor, historyFor } from './history'

const PROJECT = `30850:${'a'.repeat(64)}:the-project`
const OTHER = `30850:${'a'.repeat(64)}:another`
const AUTHOR = 'b'.repeat(64)
const LEAD = 'c'.repeat(64)

let seq = 0
const change = (field: string, value: string, target = PROJECT): Change => ({
  id: `change-${++seq}`,
  author: AUTHOR,
  createdAt: 1_700_000_000 + seq,
  target,
  field,
  value,
  format: 'marker',
  note: '',
})

const directory = {
  nameOf: (pubkey: string) => (pubkey === LEAD ? 'Ana Duarte' : 'Miky'),
  personOf: (pubkey: string) => ({ name: pubkey === LEAD ? 'Ana Duarte' : 'Miky' }),
} as unknown as DirectoryView

const history = (activity: Change[]) => historyFor(PROJECT, { activity, projects: [] } as unknown as FolderState, directory, PROJECT_STATUSES)

describe("a project's History", () => {
  it('says its status in the project’s own words, newest first, and only its own changes', () => {
    const entries = history([change('status', 'planned'), change('status', 'completed', OTHER), change('status', 'completed')])
    expect(entries.map((entry) => entry.text)).toEqual(['set status to Completed', 'set status to Planned'])
    // The newest is what "Edited … ago" says.
    expect(entries[0]!.at).toBe(1_700_000_000 + seq)
  })

  it('names the lead it was given, and the one it took away', () => {
    expect(history([change('lead', LEAD), change('lead', '')]).map((entry) => entry.text)).toEqual(['removed Ana Duarte as the lead', 'made Ana Duarte the lead'])
  })
})

describe('"Edited … ago" over a page (ONE-6, step 4a)', () => {
  const NOW = Math.floor(Date.now() / 1000)
  const at = (field: string, value: string, secondsAgo: number, author = AUTHOR): Change => ({ ...change(field, value), createdAt: NOW - secondsAgo, author })
  const edited = (activity: Change[]) =>
    editedFor(PROJECT, { activity, projects: [] } as unknown as FolderState, directory, { at: NOW - 86400 * 2, by: LEAD })

  it('says its newest change, and who made it and exactly when under the pointer', () => {
    const time = edited([at('title', 'Old', 7200), at('status', 'completed', 3 * 3600 - 7200)])
    expect(time.label).toBe('Edited 1h ago')
    expect(time.exact).toMatch(/^Edited by Miky · /)
  })

  it('leaves out who follows it: a join is not an edit, as the issues table’s Updated has it (SHI-31)', () => {
    expect(edited([at('title', 'Old', 7200), at(`member:${LEAD}`, 'true', 60, LEAD)]).label).toBe('Edited 2h ago')
  })

  it('a file not changed since it was made says when it was made, and by whom', () => {
    const time = edited([at(`member:${LEAD}`, 'true', 60, LEAD)])
    expect(time.label).toBe('Created 2d ago')
    expect(time.exact).toMatch(/^Created by Ana Duarte · /)
  })
})
