/**
 * The Issues page draws its rows first, and each row's conversation count once
 * every Folder's conversations are read — APP-5. While they are on the way a
 * row shows no count at all, never a wrong one (Katerina, 28 Oct).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WorkspaceState } from '@/api'
import { ThreadsContext } from '@/api/useThreads'
import { IssuesPage } from './IssuesPage'

const FOLDER = '11111111-1111-4111-8111-111111111111'
const ISSUE = '30851:x:i1'

const message = (id: string) => ({ id, author: 'a', createdAt: 1, body: 'hi', folder: FOLDER, about: [ISSUE] })
const conversation = (id: string) => ({ id, root: message(id), replies: [], about: [ISSUE], createdAt: 1, lastAt: 1 })

const state = (held: boolean) =>
  ({
    projects: [],
    issues: [{ addr: ISSUE, id: 'i1', author: 'a', createdAt: 1, title: 'Counted', description: '', descriptionFormat: 'marker', folder: FOLDER, status: 'todo', fields: {} }],
    activity: [],
    // Before every Folder's are read, only some may be held — an opened page's own: a count from them is wrong.
    conversations: held ? [conversation('c1'), conversation('c2')] : [conversation('c1')],
    anchors: {}, edits: {}, attachments: {}, urgent: {}, parts: {}, embeds: {},
    folders: [FOLDER],
    events: [],
    threadsAt: held ? { [FOLDER]: 1, '22222222-2222-4222-8222-222222222222': 1 } : { '22222222-2222-4222-8222-222222222222': 1 },
    mentionsOf: [],
  }) as unknown as WorkspaceState

const directory = { personOf: () => undefined, nameOf: () => '' } as never
const archives = { ofIssue: () => undefined, ofProject: () => undefined } as never

const page = (held: boolean, want = vi.fn()) => (
  <ThreadsContext.Provider value={want}>
    <IssuesPage state={state(held)} directory={directory} archives={archives} say={() => {}} refresh={async () => {}} />
  </ThreadsContext.Provider>
)

describe('Issues page counts (APP-5)', () => {
  it("draws the row with no count while the conversations are on the way, asks for every Folder's, then draws the count", () => {
    const want = vi.fn()
    const { rerender } = render(page(false, want))
    expect(screen.getByText('Counted')).toBeInTheDocument()
    expect(screen.queryByLabelText(/conversations?$/)).toBeNull()
    expect(want).toHaveBeenCalledWith({ folders: [FOLDER], about: [] })

    rerender(page(true, want))
    expect(screen.getByLabelText('2 conversations')).toBeInTheDocument()
  })
})
