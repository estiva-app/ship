/**
 * A project's History (ONE-6): its own changes, newest first, in words, as an issue's are. It feeds the History
 * section of the Overview panel and "Edited … ago" over the page (step 4); nothing draws it yet.
 */
import { describe, expect, it } from 'vitest'
import type { Change, DirectoryView, FolderState } from '@/api'
import { PROJECT_STATUSES } from '@/nostr/kinds'
import { historyFor } from './history'

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
