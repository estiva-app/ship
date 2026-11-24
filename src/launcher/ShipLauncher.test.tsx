/**
 * KIN-6 — Ship's ⌘K, as the frame mounts it, on an open issue or project: Ctrl+K opens the box, a sentence asks the
 * browser's model about what is open (an issue: its description and every comment; a project: its description, its
 * issues one line each and its own comments), and the answer becomes a comment draft or a passage in the description
 * (Miky, KIN-6 kickoff). Add issue and New project open Ship's own forms. The box's own behaviour is
 * `@estiva-app/launcher`'s and tested there.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { blockIds, descriptionTextToBlockDocument, serializeBlockDocument } from '@estiva-app/protocol'
import { AppShell, ToastProvider } from '@estiva-app/ui'
import { useKeptLauncher } from '@estiva-app/launcher'
import type { ReferenceCandidate } from '@estiva-app/conversation'
import { stubLayout } from '@/test/inlineText'
import type { ThreadData } from '@/components/ConversationThread'

/* The relay's search, and a file's manifest link, as the relay would answer them. */
const relay = vi.hoisted(() => ({ hits: [] as ReferenceCandidate[], openUrl: undefined as string | undefined }))
vi.mock('@/api/foreign', async (original) => ({
  ...(await original<typeof import('@/api/foreign')>()),
  searchFiles: vi.fn(async () => relay.hits),
  resolveForeign: vi.fn(async (address: string) => ({ address, openUrl: relay.openUrl })),
}))

import { IssueView, type IssueViewProps } from '@/views/IssueView'
import { ProjectView, type ProjectViewProps } from '@/views/ProjectView'
import { useFormHere } from './forms'
import { captureOpenFile, useOpenFile, useOpenThreads } from './openFile'
import { openFile, ShipLauncher } from './ShipLauncher'

/* The browser's on-device model, as `onDeviceModel` finds it: ready, answering with what the test says, and keeping what it was told. */
const model = vi.hoisted(() => ({ answer: '', told: [] as string[] }))
beforeAll(() => {
  const session = {
    prompt: async (instruction: string) => {
      model.told.push(instruction)
      return model.answer
    },
    destroy: () => {},
  }
  Object.defineProperty(globalThis, 'LanguageModel', {
    configurable: true,
    value: { availability: async () => 'available', create: async () => session, params: async () => ({}) },
  })
  stubLayout()
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  model.told = []
  relay.hits = []
  relay.openUrl = undefined
  localStorage.clear()
})

const ME = 'a'.repeat(64)
const ISSUE = `30851:${ME}:11111111-1111-4111-8111-111111111111`
const PROJECT = `30850:${ME}:22222222-2222-4222-8222-222222222222`
const BODY = descriptionTextToBlockDocument('Columns come back in the wrong order.\n\nThey should keep the order they were left in.')
const [CAUSE, WANT] = blockIds(BODY)
const at = 1_760_000_000
const thread = (id: string, by: string, body: string, block?: string): ThreadData => ({
  id,
  root: { id, author: { name: by }, at, body, ...(block ? { anchor: { state: 'resolved', id: block, block: { type: 'paragraph', id: block } } } : {}) },
  replies: [],
})
const ON_CAUSE = thread('c'.repeat(64), 'Ravi Mehta', 'It re-reads the team and the archived one lands last.', CAUSE)
const WHO = thread('d'.repeat(64), 'Ana Duarte', 'I will fix it tomorrow.')

const issueView = (extra: Partial<IssueViewProps> = {}) => (
  <IssueView
    about={ISSUE}
    crumbs={{ issuesHref: '/issues', project: { title: 'Relay Migration', href: '/project/rel' } }}
    title="Board columns lose order"
    description={serializeBlockDocument(BODY)}
    descriptionFormat="blocks"
    onRename={vi.fn()}
    onDescribe={vi.fn(() => true)}
    threads={[ON_CAUSE, WHO]}
    onStartConversation={vi.fn()}
    onReply={vi.fn()}
    activity={[]}
    history={[]}
    fields={{ status: 'todo', statuses: [{ value: 'todo', label: 'Todo', colour: 'neutral' }], onStatusChange: vi.fn(), assignee: '', people: [], onAssigneeChange: vi.fn(), project: '', projects: [], onProjectChange: vi.fn() }}
    menu={{ archive: 'none', onArchive: vi.fn(), onDelete: vi.fn(), onCopyLink: vi.fn() }}
    comments={{ shown: true, onShownChange: vi.fn() }}
    overview={{ shown: false, onShownChange: vi.fn() }}
    {...extra}
  />
)

const projectView = (extra: Partial<ProjectViewProps> = {}) => (
  <ProjectView
    about={PROJECT}
    crumbs={{ projectsHref: '/projects', title: 'Relay Migration' }}
    header={{ title: 'Relay Migration', description: 'Move every team to the new relay.', descriptionFormat: 'marker', archived: false, onRename: vi.fn(), onDescribe: vi.fn() }}
    tab="overview"
    onTab={vi.fn()}
    view="table"
    onView={vi.fn()}
    issues={[
      { addr: ISSUE, id: '1', ref: 'REL-1', title: 'Board columns lose order', status: 'in_progress', assignee: { name: 'Ana Duarte' }, openedBy: {}, at },
      { addr: `30851:${ME}:3`, id: '3', ref: 'REL-3', title: 'Pick the dark theme accent', status: 'todo', openedBy: {}, at },
    ]}
    issueStatuses={[
      { value: 'todo', label: 'Todo' },
      { value: 'in_progress', label: 'In Progress' },
    ]}
    hrefFor={() => '#'}
    threads={[WHO]}
    onStartConversation={vi.fn()}
    onReply={vi.fn()}
    activity={[]}
    history={[]}
    fields={{ status: 'active', statuses: [{ value: 'active', label: 'Active', colour: 'neutral' }], onStatusChange: vi.fn(), lead: '', people: [], onLeadChange: vi.fn(), done: 0, total: 2 }}
    menu={{ archive: 'none', onArchive: vi.fn(), onDelete: vi.fn(), onCopyLink: vi.fn() }}
    comments={{ shown: true, onShownChange: vi.fn() }}
    overview={{ shown: false, onShownChange: vi.fn() }}
    {...extra}
  />
)

const say = vi.fn()
/** A page in Ship's frame, whose search and Ctrl+K open the box, as App holds them. */
function Frame({ children }: { children: React.ReactNode }) {
  const kept = useKeptLauncher(captureOpenFile, (box) => <ShipLauncher {...box} people={[]} say={say} />)
  return (
    <ToastProvider>
      <AppShell nav={null} onSearch={kept.toggle} searchPlaceholder="Search Ship...">
        {children}
      </AppShell>
      {kept.launcher}
    </ToastProvider>
  )
}

type EditorBox = HTMLElement & { editor: Editor }
const field = () => document.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-command-palette-field]')
const option = (title: string) => screen.queryAllByRole('option').find((o) => o.textContent?.includes(title))
const description = () => (screen.getByRole('textbox', { name: 'Description' }) as EditorBox).editor

async function openBox() {
  act(() => void fireEvent.keyDown(document, { key: 'k', ctrlKey: true }))
  await waitFor(() => expect(field()).toBeTruthy())
}

/** Draw the page, press Ctrl+K, and ask; resolves once the answer shows. */
async function ask(page: React.ReactNode, sentence: string, answer: string, waitFor_: string) {
  model.answer = answer
  render(<Frame>{page}</Frame>)
  await waitFor(() => expect(description()?.isInitialized).toBe(true))
  await openBox()
  fireEvent.change(field()!, { target: { value: sentence } })
  fireEvent.keyDown(field()!, { key: 'Enter' })
  await waitFor(() => expect(option(waitFor_)).toBeTruthy())
}

describe("Ship's ⌘K, about the open issue (KIN-6)", () => {
  it('asks the model about the issue: its description as written and every comment on it', async () => {
    await ask(issueView(), 'who is fixing the board order?', 'Ana is fixing it tomorrow [2].', 'Draft a comment')
    const told = model.told.join('\n')
    expect(told).toContain('Columns come back in the wrong order.')
    expect(told).toContain('They should keep the order they were left in.')
    expect(told).toContain('It re-reads the team and the archived one lands last.')
    expect(told).toContain('I will fix it tomorrow.')
  })

  it('drafts the answer as a new comment in the comment box, unsent', async () => {
    const start = vi.fn()
    await ask(issueView({ onStartConversation: start }), 'who is fixing the board order?', 'Ana is fixing it tomorrow.', 'Draft a comment')
    act(() => void fireEvent.click(option('Draft a comment')!))
    const box = (await screen.findByRole('textbox', { name: 'Start a conversation…' }, { timeout: 5000 })) as EditorBox
    await waitFor(() => expect(box.textContent).toContain('Ana is fixing it tomorrow.'))
    expect(start).not.toHaveBeenCalled()
  })

  it('keeps a comment already started, and puts the answer after its words', async () => {
    localStorage.clear()
    await ask(issueView(), 'who is fixing the board order?', 'Ana is fixing it tomorrow.', 'Draft a comment')
    const { draftKeys, appDrafts } = await import('@/lib/drafts')
    appDrafts.write(draftKeys.object(ISSUE), 'Before I forget:')
    act(() => void fireEvent.click(option('Draft a comment')!))
    const box = (await screen.findByRole('textbox', { name: 'Start a conversation…' }, { timeout: 5000 })) as EditorBox
    await waitFor(() => expect(box.textContent).toContain('Ana is fixing it tomorrow.'))
    expect(box.textContent).toMatch(/Before I forget:.*Ana is fixing it tomorrow\./s)
  })

  it('inserts the answer into the description and saves it', async () => {
    const onDescribe = vi.fn(() => true)
    await ask(issueView({ onDescribe }), 'what should the board do?', 'Keep the order they were left in [1].', 'Insert into the description')
    act(() => void fireEvent.click(option('Insert into the description')!))
    await waitFor(() => expect(description().getText()).toContain('Keep the order they were left in'))
    await waitFor(() => expect(onDescribe).toHaveBeenCalled())
    expect(JSON.stringify(onDescribe.mock.calls.at(-1))).toContain('Keep the order they were left in')
  })

  it('offers neither row on an issue that takes no comment and no edit', async () => {
    model.answer = 'Ana is fixing it.'
    render(<Frame>{issueView({ lockedReason: 'Unarchive to edit', commentsClosed: 'Archived. Unarchive it to comment.' })}</Frame>)
    await screen.findByText('Archived. Unarchive it to comment.')
    await openBox()
    fireEvent.change(field()!, { target: { value: 'who is fixing it?' } })
    fireEvent.keyDown(field()!, { key: 'Enter' })
    await waitFor(() => expect(document.body.textContent).toContain('Ana is fixing it.'))
    // Read from the stored description, with no editor on an archived issue.
    expect(model.told.join('\n')).toContain('Columns come back in the wrong order.')
    expect(option('Draft a comment')).toBeUndefined()
    expect(option('Insert into the description')).toBeUndefined()
  })
})

describe("Ship's ⌘K, about the open project (KIN-6)", () => {
  it("asks about its description, each of its issues on one line, and the project's own comments", async () => {
    await ask(projectView(), 'what is still open here?', 'Two issues are open.', 'Draft a comment')
    const told = model.told.join('\n')
    expect(told).toContain('Move every team to the new relay.')
    expect(told).toContain('REL-1 Board columns lose order — In Progress, assigned to Ana Duarte')
    expect(told).toContain('REL-3 Pick the dark theme accent — Todo, assigned to nobody')
    expect(told).toContain('I will fix it tomorrow.')
  })
})

/** A page that holds Ship's Add issue form, as the issue and project pages do. */
function HoldsAddIssue({ open }: { open: () => void }) {
  useFormHere('issue', open)
  return null
}

describe("Ship's ⌘K, Add issue and New project (KIN-6)", () => {
  it('offers Add issue in the open project, and opens the form the page holds', async () => {
    const open = vi.fn()
    render(
      <Frame>
        {issueView()}
        <HoldsAddIssue open={open} />
      </Frame>,
    )
    await openBox()
    const add = await waitFor(() => {
      const row = option('Add issue')
      expect(row?.textContent).toContain('In Relay Migration')
      return row!
    })
    expect(option('New project')).toBeTruthy()
    act(() => void fireEvent.click(add))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('goes to the Issues page for Add issue where no page holds the form, and the page there opens it', async () => {
    render(<Frame>{null}</Frame>)
    await openBox()
    await waitFor(() => expect(option('Add issue')).toBeTruthy())
    act(() => void fireEvent.click(option('Add issue')!))
    expect(window.location.pathname).toMatch(/issues/)
    const open = vi.fn()
    render(<HoldsAddIssue open={open} />)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe("Ship's ⌘K, search (KIN-6)", () => {
  it('lists files from every app for two words, a Leaf page saying it opens in Leaf', async () => {
    relay.hits = [
      { type: 'file', kind: 30842, id: `30842:${ME}:notes`, uri: 'nostr:naddr1notes', title: 'Board review notes', caption: 'Estiva HQ', tier: 2 },
      { type: 'file', kind: 30851, id: `30851:${ME}:other`, uri: 'nostr:naddr1issue', title: 'Board order after unarchive', caption: 'Relay Migration', tier: 2 },
    ] as unknown as ReferenceCandidate[]
    render(<Frame>{null}</Frame>)
    await openBox()
    fireEvent.change(field()!, { target: { value: 'board' } })
    await waitFor(() => expect(option('Board review notes')?.textContent).toContain('Opens in Leaf'), { timeout: 3000 })
    expect(option('Board order after unarchive')?.textContent).toContain('Relay Migration')
    expect(option('Board order after unarchive')?.textContent).not.toContain('Opens in Leaf')
  })
})

describe('where a file opens from ⌘K (KIN-6)', () => {
  it("never follows another app's link off Estiva's own hosts, and says it cannot open it", async () => {
    relay.openUrl = 'https://elsewhere.example/document/x'
    const leave = vi.fn()
    const cannot = vi.fn()
    openFile(`30842:${ME}:x`, 'Notes', cannot, leave, 'ship.estiva.app')
    await waitFor(() => expect(cannot).toHaveBeenCalled())
    expect(leave).not.toHaveBeenCalled()
  })

  it("follows a Leaf page's link to Leaf beside Ship", async () => {
    relay.openUrl = 'https://leaf.estiva.app/document/notes-x'
    const leave = vi.fn()
    openFile(`30842:${ME}:x`, 'Notes', vi.fn(), leave, 'ship.estiva.app')
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://leaf.estiva.app/document/notes-x'))
  })

  it('opens an issue on its own page here', () => {
    openFile(ISSUE, 'Board columns lose order', vi.fn())
    expect(window.location.pathname).toContain('11111111-1111-4111-8111-111111111111')
  })
})

describe('what an ask reads (KIN-6)', () => {
  function Open({ resolved }: { resolved: string[] }) {
    useOpenFile({ address: ISSUE, kind: 'issue', title: 'Board', editor: null, description: 'Columns come back wrong.', format: 'marker', canComment: true, canEdit: true, showComments: () => {}, startDraft: () => {} })
    useOpenThreads(ISSUE, [ON_CAUSE, WHO], (id) => resolved.includes(id))
    return null
  }

  it('marks a resolved thread as resolved, and leaves an open one unmarked', () => {
    render(<Open resolved={[WHO.id]} />)
    const parts = captureOpenFile().open!.messages
    expect(parts.find((p) => p.body === 'I will fix it tomorrow.')?.resolved).toBe(true)
    expect(parts.find((p) => p.body.startsWith('It re-reads'))?.resolved).toBeUndefined()
  })

  it('has nothing to ask about on a page with no issue or project open', () => {
    expect(captureOpenFile()).toEqual({})
  })
})
