import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./store', () => ({
  store: {
    createProject: vi.fn(),
    createIssue: vi.fn(),
    setField: vi.fn(),
    archiveProject: vi.fn(),
    moveProject: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    postMessage: vi.fn(),
    editMessage: vi.fn(),
    setListedInTopic: vi.fn(),
    writeField: vi.fn(),
  },
  // Off unless a test turns it on: the relay keeps no order (ALO-5).
  projectFieldsNow: vi.fn(async () => undefined),
}))
vi.mock('./clock', () => ({ clockProblem: vi.fn() }))
vi.mock('./foreign', () => ({ readFolderListing: vi.fn(), loadQuery: () => async () => [] }))

import { clockProblem } from './clock'
import { readFolderListing } from './foreign'
import { store } from './store'
import { archiveProject, createFolder, createIssue, createProject, editMessage, moveProject, renameFolder, reply, setIssueField, setListedInTopic, setProjectField, startConversation } from './writes'
import { addrToNaddr, Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { Store } from '../nostr/store'
import { SignerTokenExpired, type Signer } from '../nostr/signer'

const s = store as unknown as Record<string, ReturnType<typeof vi.fn>>
const PK = 'ab'.repeat(32)
const PROJECT = { addr: `30850:${PK}:1`, id: '1', author: PK, createdAt: 1, title: 'Relay Migration', description: '', descriptionFormat: 'marker' as const, contentFolder: 'content-folder', key: 'REL', status: 'planned', archived: false, fields: {} }
const TEAM = { folder: '3167adea-877f-43c4-96fb-517a2b2d5d24', hasState: true }
const ISSUE = { addr: `30851:${PK}:2`, id: '2', author: PK, createdAt: 1, title: 'I', description: '', descriptionFormat: 'marker' as const, folder: 'issue-folder', projectAddr: PROJECT.addr, ref: 'REL-2', status: 'todo', fields: {} }

beforeEach(() => {
  vi.mocked(clockProblem).mockResolvedValue(null)
  for (const fn of Object.values(s)) fn.mockReset()
  vi.mocked(readFolderListing).mockReset().mockResolvedValue([])
})

describe('the clock is checked before anything is signed', () => {
  it('refuses every write with the clock sentence, and calls nothing', async () => {
    vi.mocked(clockProblem).mockResolvedValue('clock is off')
    expect(await setIssueField(ISSUE, 'status', 'done', 'Status → done')).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createProject({ title: 'X', description: '', key: 'XXX', team: TEAM })).toEqual({ ok: false, reason: 'clock is off' })
    expect(await createIssue(PROJECT, { projects: [PROJECT], issues: [] }, { title: 'X', description: '' })).toEqual({ ok: false, reason: 'clock is off' })
    expect(s.setField).not.toHaveBeenCalled()
    expect(s.createProject).not.toHaveBeenCalled()
    expect(s.createIssue).not.toHaveBeenCalled()
  })
})

describe('accepted is authoritative — only ok is read', () => {
  it('a rejection the relay answered with 200 is a failure with its reason', async () => {
    s.setField.mockResolvedValue({ ok: false, reason: 'not a channel member' })
    expect(await setIssueField(ISSUE, 'status', 'done', 'Status → done')).toEqual({ ok: false, reason: 'not a channel member' })
  })

  it('a thrown request is a failure with its message, never a success', async () => {
    s.setField.mockRejectedValue(new Error('network down'))
    expect(await setIssueField(ISSUE, 'assignee', 'k', 'Assign')).toEqual({ ok: false, reason: 'network down' })
  })

  it('a duplicate the relay already held is fine', async () => {
    s.setField.mockResolvedValue({ ok: true, duplicate: true })
    expect(await setIssueField(ISSUE, 'status', 'done', 'x')).toEqual({ ok: true })
  })
})

describe('which Folder each write goes to', () => {
  it("an issue's field change goes to the issue's own Folder", async () => {
    s.setField.mockResolvedValue({ ok: true })
    await setIssueField(ISSUE, 'status', 'in_progress', 'Status → in_progress')
    expect(s.setField).toHaveBeenCalledWith({ folder: 'issue-folder', target: ISSUE.addr, field: 'status', value: 'in_progress', note: 'Status → in_progress' })
  })

  it("a project's record change and archive go to the Folder the record names", async () => {
    s.setField.mockResolvedValue({ ok: true })
    s.archiveProject.mockResolvedValue({ ok: true })
    await setProjectField(PROJECT, 'lead', 'k', 'Assign project')
    expect(s.setField).toHaveBeenCalledWith({ folder: 'content-folder', target: PROJECT.addr, field: 'lead', value: 'k', note: 'Assign project' })
    await archiveProject(PROJECT, true)
    expect(s.archiveProject).toHaveBeenCalledWith({ recordFolder: 'content-folder', project: PROJECT.addr, archived: true })
  })

  it("a new issue goes to the project's content Folder with the next ref among what is visible", async () => {
    s.createIssue.mockResolvedValue({ result: { ok: true }, addr: '30851:me:new', id: 'new' })
    const result = await createIssue(PROJECT, { projects: [PROJECT], issues: [ISSUE, { ...ISSUE, ref: 'REL-7' }, { ...ISSUE, ref: 'DES-9' }] }, { title: 'New', description: 'd' })
    expect(s.createIssue).toHaveBeenCalledWith({ folder: 'content-folder', title: 'New', description: 'd', projectAddr: PROJECT.addr, ref: 'REL-8' })
    expect(result).toEqual({ ok: true, addr: '30851:me:new', folder: 'content-folder' })
  })

})

describe('conversations', () => {

  it("a reply goes to the thread's own Folder, anchored to its root", async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    const conversation = { id: 'root-id', root: { id: 'root-id', author: 'a', createdAt: 1, body: 'x', folder: 'thread-folder', about: [] }, replies: [], about: [], createdAt: 1, lastAt: 1 }
    await reply(conversation, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenCalledWith({ folder: 'thread-folder', body: 'yes', replyTo: { rootId: 'root-id', parentId: 'root-id' }, linkTags: [], embeds: [] })
    await reply({ ...conversation, root: { ...conversation.root, folder: '' } }, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'fallback' }))
  })

  it('a reply to a comment names the comment and copies its anchor — SHI-28', async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    const root = { id: 'root-id', author: 'a', createdAt: 1, body: 'x', folder: 'thread-folder', about: [ISSUE.addr], anchor: ISSUE.addr }
    const conversation = { id: 'root-id', root, replies: [], about: [ISSUE.addr], createdAt: 1, lastAt: 1 }
    await reply(conversation, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenLastCalledWith({ folder: 'thread-folder', body: 'yes', replyToComment: { id: 'root-id', anchor: ISSUE.addr, author: 'a' }, linkTags: [], embeds: [] })
    // The comment is outside the read and a reply stands in: its author is not the comment's.
    await reply({ ...conversation, root: { ...root, id: 'stand-in', author: 'b' } }, 'fallback', 'yes')
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ replyToComment: { id: 'root-id', anchor: ISSUE.addr, author: undefined } }))
  })

  it('a reply sends the card its box showed, but never one for the file the thread is on (a reply under "Mentioned in")', async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    const root = { id: 'root-id', author: 'a', createdAt: 1, body: 'x', folder: 'thread-folder', about: [ISSUE.addr], anchor: ISSUE.addr }
    const conversation = { id: 'root-id', root, replies: [], about: [ISSUE.addr], createdAt: 1, lastAt: 1 }
    const other = `30851:${PK}:other`
    await reply(conversation, 'fallback', 'see both', undefined, undefined, [{ value: ISSUE.addr, layout: 'detailed' }])
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: [] }))
    await reply(conversation, 'fallback', 'see both', undefined, undefined, [{ value: other, layout: 'detailed' }])
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: [{ value: other, layout: 'detailed' }] }))
  })
})

describe('the card a comment sent from Ship carries (WBM-7, SPEC §13.6.2)', () => {
  const LINKED = `30851:${PK}:linked`
  const see = (address: string) => `see nostr:${addrToNaddr(address)}`

  it('a comment naming one other issue sends its detailed card; naming only the issue it is on, none', async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    await startConversation({ folder: 'issue-folder', about: ISSUE.addr, body: see(LINKED) })
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: [{ value: LINKED, layout: 'detailed' }] }))
    await startConversation({ folder: 'issue-folder', about: ISSUE.addr, body: see(ISSUE.addr) })
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: [] }))
  })

  it('a reply to a comment sends the card too, never for the issue the comment is on', async () => {
    s.postMessage.mockResolvedValue({ ok: true })
    const root = { id: 'root-id', author: 'a', createdAt: 1, body: 'x', folder: 'thread-folder', about: [ISSUE.addr], anchor: ISSUE.addr }
    await reply({ id: 'root-id', root, replies: [], about: [ISSUE.addr], createdAt: 1, lastAt: 1 }, 'fallback', `${see(LINKED)} and ${see(ISSUE.addr)}`)
    expect(s.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: [{ value: LINKED, layout: 'detailed' }] }))
  })

  it('✕ on a sent card sends the text as it was, that card none and the other kept, and the links that text names', async () => {
    const { sent } = signed()
    const before = `${see(LINKED)}\n\nnostr:${addrToNaddr(ISSUE.addr)}`
    const embeds = [
      { value: LINKED, layout: 'detailed' as const },
      { value: PROJECT.addr, layout: 'detailed' as const },
    ]
    await editMessage(TEAM.folder, MSG, 'the drawn body, own reference left out', { before, embeds, here: ISSUE.addr, own: { file: ISSUE.addr }, remove: LINKED })
    const edit = sent.at(-1)!
    expect(edit).toMatchObject({ kind: 40003, content: before })
    expect(edit.tags.filter((t) => t[0] === 'embed')).toEqual([
      ['embed', LINKED, 'none'],
      ['embed', PROJECT.addr, 'detailed'],
    ])
    // An edit says what the message links now; the file it is on is its `A`, not a mention.
    expect(edit.tags.filter((t) => t[0] === 'a' || t[0] === 'q')).toEqual([['a', LINKED]])
  })

  it('an edit adding the first link adds its card; an edit after ✕ leaves the set as it is', async () => {
    s.editMessage.mockResolvedValue({ ok: true })
    await editMessage('issue-folder', 'm1', see(LINKED), { before: 'no link', here: ISSUE.addr, own: { file: ISSUE.addr } })
    expect(s.editMessage).toHaveBeenLastCalledWith(expect.objectContaining({ body: see(LINKED), embeds: [{ value: LINKED, layout: 'detailed' }] }))
    await editMessage('issue-folder', 'm1', `${see(LINKED)}, edited`, { before: see(LINKED), embeds: [{ value: LINKED, layout: 'none' }], here: ISSUE.addr, own: { file: ISSUE.addr } })
    expect(s.editMessage).toHaveBeenLastCalledWith(expect.objectContaining({ embeds: undefined }))
  })

  it('an edit adding the first link, its card taken off with ✕ in the edit box, writes no card (item 37)', async () => {
    const { sent } = signed()
    await editMessage(TEAM.folder, MSG, see(LINKED), { before: 'no link', here: ISSUE.addr, own: { file: ISSUE.addr }, dropped: LINKED })
    expect(sent.at(-1)).toMatchObject({ kind: 40003, content: see(LINKED) })
    expect(sent.at(-1)!.tags.filter((t) => t[0] === 'embed')).toEqual([])
  })

  it('✕ in the edit box on the message’s own card sets it none, the rest kept; kept, the set is left as it was (item 36)', async () => {
    const { sent } = signed()
    const embeds = [
      { value: LINKED, layout: 'detailed' as const },
      { value: PROJECT.addr, layout: 'none' as const },
    ]
    await editMessage(TEAM.folder, MSG, `${see(LINKED)}, reworded`, { before: see(LINKED), embeds, here: ISSUE.addr, own: { file: ISSUE.addr }, dropped: LINKED })
    expect(sent.at(-1)!.tags.filter((t) => t[0] === 'embed')).toEqual([
      ['embed', LINKED, 'none'],
      ['embed', PROJECT.addr, 'none'],
    ])
    await editMessage(TEAM.folder, MSG, `${see(LINKED)}, reworded again`, { before: see(LINKED), embeds, here: ISSUE.addr, own: { file: ISSUE.addr } })
    expect(sent.at(-1)!.tags.filter((t) => t[0] === 'embed')).toEqual([])
  })

  it('an edit putting back a link whose card was taken off gives it no card again (item 36)', async () => {
    const { sent } = signed()
    await editMessage(TEAM.folder, MSG, see(LINKED), { before: 'no link now', embeds: [{ value: LINKED, layout: 'none' }], here: ISSUE.addr, own: { file: ISSUE.addr } })
    expect(sent.at(-1)!.tags.filter((t) => t[0] === 'embed')).toEqual([])
  })

  /*
    An edit is the whole new message (SPEC §6.8): one with no files takes them all off, so every edit lists the files it keeps.
    Asserted on the signed 40003: the mocked store hands the call to a real `Store` whose relay keeps what it was sent.
  */
  const signed = () => {
    const sent: SignedEvent[] = []
    const relay = { publish: async (event: SignedEvent) => (sent.push(event), { ok: true }) } as unknown as Relay
    const signer = { pubkey: PK, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'e'.repeat(64), sig: '0'.repeat(128) }) } as unknown as Signer
    const real = new Store(relay, signer)
    s.editMessage.mockImplementation((args: Parameters<Store['editMessage']>[0]) => real.editMessage(args))
    const imetas = () => sent.at(-1)!.tags.filter((t) => t[0] === 'imeta')
    return { sent, imetas }
  }
  const MSG = 'd'.repeat(64)
  const kept = { url: `/media/${'b'.repeat(64)}.png`, m: 'image/png', x: 'b'.repeat(64), size: 40, dim: '800x600', filename: 'shot.png' }
  const KEPT_TAG = ['imeta', `url /media/${'b'.repeat(64)}.png`, 'm image/png', `x ${'b'.repeat(64)}`, 'size 40', 'dim 800x600', 'filename shot.png']

  it('an edit naming a link keeps the files the box saved with it (PEEKM-4)', async () => {
    const { sent, imetas } = signed()
    const file = { url: `/media/${'a'.repeat(64)}.pdf`, m: 'application/pdf', x: 'a'.repeat(64), size: 900, filename: 'brief.pdf' }
    await editMessage(TEAM.folder, MSG, see(LINKED), { before: 'no link', here: ISSUE.addr, own: { file: ISSUE.addr } }, [file])
    expect(sent.at(-1)).toMatchObject({ kind: 40003, content: see(LINKED) })
    expect(imetas()).toEqual([['imeta', `url /media/${'a'.repeat(64)}.pdf`, 'm application/pdf', `x ${'a'.repeat(64)}`, 'size 900', 'filename brief.pdf']])
  })

  it('an edit of the words only still lists the files the message has', async () => {
    const { sent, imetas } = signed()
    expect(await editMessage(TEAM.folder, MSG, 'reworded', { before: 'worded', here: ISSUE.addr, own: { file: ISSUE.addr }, files: [kept] })).toEqual({ ok: true })
    expect(sent.at(-1)).toMatchObject({ kind: 40003, content: 'reworded' })
    expect(imetas()).toEqual([KEPT_TAG])
  })

  it('a words-only edit lists a file back with every field it was sent with, blurhash and fallbacks included', async () => {
    const { imetas } = signed()
    const rich = { ...kept, blurhash: 'LKO2?U%2Tw=w', fallback: ['https://a.example/x.png', 'https://b.example/x.png'] }
    await editMessage(TEAM.folder, MSG, 'reworded', { before: 'worded', here: ISSUE.addr, own: { file: ISSUE.addr }, files: [rich] })
    expect(imetas()).toEqual([[
      'imeta', `url /media/${'b'.repeat(64)}.png`, 'm image/png', `x ${'b'.repeat(64)}`, 'size 40', 'dim 800x600',
      'blurhash LKO2?U%2Tw=w', 'fallback https://a.example/x.png', 'fallback https://b.example/x.png', 'filename shot.png',
    ]])
  })

  it('✕ on a sent card still lists the files the message has', async () => {
    const { sent, imetas } = signed()
    await editMessage(TEAM.folder, MSG, 'drawn', { before: see(LINKED), embeds: [{ value: LINKED, layout: 'detailed' }], here: ISSUE.addr, own: { file: ISSUE.addr }, remove: LINKED, files: [kept] })
    expect(sent.at(-1)!.tags).toContainEqual(['embed', LINKED, 'none'])
    expect(imetas()).toEqual([KEPT_TAG])
  })

  it('an edit of a message not in hand is refused, since an edit listing no files would take them off', async () => {
    const { sent } = signed()
    expect(await editMessage(TEAM.folder, MSG, 'reworded')).toMatchObject({ ok: false, reason: expect.stringContaining('could not be read') })
    expect(sent).toEqual([])
  })

  it('every file taken off in the box goes out as an edit listing none, not the ones the message had', async () => {
    const { sent, imetas } = signed()
    expect(await editMessage(TEAM.folder, MSG, 'worded', { before: 'worded', here: ISSUE.addr, own: { file: ISSUE.addr }, files: [kept] }, [])).toEqual({ ok: true })
    expect(sent.at(-1)).toMatchObject({ kind: 40003, content: 'worded' })
    expect(imetas()).toEqual([])
  })

  it('files changed in the box replace the ones the message had', async () => {
    const { imetas } = signed()
    const added = { url: `/media/${'c'.repeat(64)}.pdf`, m: 'application/pdf', x: 'c'.repeat(64), size: 9, filename: 'new.pdf' }
    await editMessage(TEAM.folder, MSG, 'worded', { before: 'worded', here: ISSUE.addr, own: { file: ISSUE.addr }, files: [kept] }, [kept, added])
    expect(imetas()).toEqual([KEPT_TAG, ['imeta', `url /media/${'c'.repeat(64)}.pdf`, 'm application/pdf', `x ${'c'.repeat(64)}`, 'size 9', 'filename new.pdf']])
  })
})

describe('creating a project', () => {
  it('a project is created in the team it names', async () => {
    s.createProject.mockResolvedValue({ result: { ok: true }, placed: { ok: true }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', key: 'XXX', team: TEAM })).toEqual({ ok: true, addr: 'a' })
    expect(s.createProject).toHaveBeenCalledWith({ title: 'X', description: '', key: 'XXX', team: TEAM, filedIn: false })
  })

  it('a refused record is no project', async () => {
    s.createProject.mockResolvedValue({ result: { ok: false, reason: 'refused' }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', key: 'XXX', team: TEAM })).toEqual({ ok: false, reason: 'refused' })
  })

  it('a refused listing is a created project that says why Peek will not place it', async () => {
    s.createProject.mockResolvedValue({ result: { ok: true }, placed: { ok: false, reason: 'rate limited' }, addr: 'a', id: 'i', folder: TEAM.folder })
    expect(await createProject({ title: 'X', description: '', key: 'XXX', team: TEAM })).toEqual({ ok: true, addr: 'a', unlisted: 'rate limited' })
  })
})

describe('moving a project', () => {
  const FROM = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', hasState: true }
  const TO = { id: TEAM.folder, hasState: true }

  const OTHER = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', hasState: true }
  const THIRD = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', hasState: true }
  const listing = [{ ref: PROJECT.addr, address: PROJECT.addr }]
  /** The real store and relay client, over a transport that answers each move as `answer` says: what the relay is sent, and what the person reads. */
  const relayAnswering = (answer: (event: SignedEvent, index: number) => { status: number; body: unknown } = () => ({ status: 200, body: { accepted: true } })) => {
    const sent: SignedEvent[] = []
    const signer = { pubkey: PK, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'e'.repeat(64), sig: '0'.repeat(128) }) } as unknown as Signer
    const fetch = async (_url: string, init: { body: string }) => {
      const event = JSON.parse(init.body) as SignedEvent
      sent.push(event)
      const { status, body } = answer(event, sent.length - 1)
      return { status, text: async () => JSON.stringify(body), headers: { get: () => null } }
    }
    const real = new Store(new Relay('https://relay.test', signer, { fetch: fetch as never, busyRetryDelaysMs: [] }), signer)
    s.moveProject.mockImplementation((args: Parameters<Store['moveProject']>[0]) => real.moveProject(args))
    return { sent, real, signer }
  }
  const refuse = (message: string) => ({ status: 200, body: { accepted: false, message } })
  const tag = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
  const wire = (sent: SignedEvent[]) => sent.map((event) => [event.kind, tag(event, 'op'), tag(event, 'h'), tag(event, 'from') ?? null, event.tags.filter((t) => t[0] === 'a').map((t) => t[1])])

  it('moves by address, from the Folders that list it, to the one chosen, with what each lists', async () => {
    const sub = { ref: 'sub', address: '30840:x:sub', parentRef: PROJECT.addr }
    vi.mocked(readFolderListing).mockResolvedValue([sub] as never)
    const { sent } = relayAnswering()
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: true })
    // The source's listing, read at the move (SPEC §3.3); the project is named beside what it lists under it, though its card did not resolve.
    expect(readFolderListing).toHaveBeenCalledWith(FROM.id, expect.any(Function))
    expect(wire(sent)).toEqual([[1852, 'move', TO.id, FROM.id, [PROJECT.addr, sub.address]]])
  })

  it('a project its Folder is under but does not list is placed in the one chosen, not moved out of a Folder that holds none of it', async () => {
    const { sent } = relayAnswering()
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: true })
    expect(wire(sent)).toEqual([[1852, 'add', TO.id, null, [PROJECT.addr]]])
  })

  it('sends nothing when a source cannot be read — what is under the project would be left behind', async () => {
    vi.mocked(readFolderListing).mockRejectedValue(new Error('rate-limited'))
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: false, reason: 'Nothing was moved: the team it is in could not be read. Try again.' })
    expect(s.moveProject).not.toHaveBeenCalled()
  })

  it('a move into a private Folder is refused, saying why, and nothing is sent', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    const { sent } = relayAnswering()
    expect(await moveProject(PROJECT, [FROM], { ...TO, private: true })).toEqual({ ok: false, reason: 'Nothing was moved: that team is private, and this project would stay readable by the whole workspace.' })
    expect(sent).toEqual([])
  })

  it('a move into a Folder with no list of its own is refused, saying why, and nothing is sent', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    const { sent } = relayAnswering()
    expect(await moveProject(PROJECT, [FROM], { ...TO, hasState: false })).toEqual({ ok: false, reason: 'Nothing was moved: that team has no list of its own, so adding to it would hide what is already there.' })
    expect(sent).toEqual([])
  })

  // TEA-3: the relay's real refusals of the one move, and what the person reads for each — never the relay's text.
  it.each([
    ["invalid: only the team's members mark or unmark its spaces", 'Nothing was moved: you need to be a member of both teams to move this.'],
    ['invalid: channel is archived', 'Nothing was moved: one of the teams is archived.'],
    ['invalid: team 31afb7af is archived; its list does not change', 'Nothing was moved: one of the teams is archived.'],
    [`invalid: the team a move leaves does not list ${PROJECT.addr}`, 'Nothing was moved: the teams changed since you opened this. Try again.'],
    ['invalid: the team a move leaves lists none of its files', 'Nothing was moved: the teams changed since you opened this. Try again.'],
    ["invalid: a topic is listed by one team: take it off the other team's list first", 'Nothing was moved: the teams changed since you opened this. Try again.'],
    ['invalid: rate-limited', 'Nothing was moved. Try again.'],
  ])('the relay refusing the move with %j reads: %s', async (message, reason) => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    const { sent } = relayAnswering(() => refuse(message))
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: false, reason, ...(/teams changed/.test(reason) ? { changed: true } : {}) })
    expect(wire(sent)).toEqual([[1852, 'move', TO.id, FROM.id, [PROJECT.addr]]])
  })

  it('a refused second move leaves the first standing and names only the Folder that refused; the one after it is never sent', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    const { sent } = relayAnswering((_, index) => (index === 1 ? refuse('invalid: channel is archived') : { status: 200, body: { accepted: true } }))
    expect(await moveProject(PROJECT, [FROM, OTHER, THIRD], TO)).toEqual({ ok: true, stillIn: { folder: OTHER.id, why: 'one of the teams is archived.' } })
    expect(wire(sent).map((move) => move[3])).toEqual([FROM.id, OTHER.id])
  })

  it('a second move refused for no reason Ship knows says only which Folder still lists it', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    relayAnswering((_, index) => (index === 1 ? refuse('invalid: rate-limited') : { status: 200, body: { accepted: true } }))
    expect(await moveProject(PROJECT, [FROM, OTHER], TO)).toEqual({ ok: true, stillIn: { folder: OTHER.id } })
  })

  it('this side failing on the second move — a cancelled passkey, a busy relay, an ended sign-in — is said as that failure, after the first landed', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    const { signer } = relayAnswering()
    const sign = signer.sign.bind(signer)
    let signs = 0
    signer.sign = async (unsigned) => (unsigned.kind === 1852 && ++signs === 2 ? Promise.reject(new Error('The operation either timed out or was not allowed.')) : sign(unsigned))
    expect(await moveProject(PROJECT, [FROM, OTHER], TO)).toEqual({ ok: true, stillIn: { folder: OTHER.id, why: 'the move could not be sent. Try again.' } })

    signs = 0
    signer.sign = async (unsigned) => (unsigned.kind === 1852 && ++signs === 2 ? Promise.reject(new SignerTokenExpired()) : sign(unsigned))
    expect(await moveProject(PROJECT, [FROM, OTHER], TO)).toEqual({ ok: true, stillIn: { folder: OTHER.id, why: 'your sign-in has ended. Sign in again.' } })

    relayAnswering((_, index) => (index === 1 ? { status: 429, body: { error: 'rate-limited: quota exceeded; retry in 10s' } } : { status: 200, body: { accepted: true } }))
    expect(await moveProject(PROJECT, [FROM, OTHER], TO)).toEqual({ ok: true, stillIn: { folder: OTHER.id, why: 'the relay is too busy right now. Try again shortly.' } })
  })

  it('this side failing on the first move is said as that failure, with nothing moved', async () => {
    vi.mocked(readFolderListing).mockResolvedValue(listing as never)
    relayAnswering(() => ({ status: 503, body: { error: 'overloaded' } }))
    expect(await moveProject(PROJECT, [FROM], TO)).toEqual({ ok: false, reason: 'Nothing was moved: the relay is too busy right now. Try again shortly.' })
  })
})

describe('createFolder and renameFolder say what the relay did (FOL-8)', () => {
  const FOLDER = { id: '11111111-1111-4111-8111-111111111111', hasState: true }

  it('a created Folder resolves its id', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, result: { ok: true } })
    expect(await createFolder('New')).toEqual({ ok: true, id: FOLDER.id })
  })

  it('a refused channel is no Folder at all', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, refusedAt: 0, result: { ok: false, reason: 'restricted' } })
    expect(await createFolder('New')).toEqual({ ok: false, reason: 'restricted' })
  })

  it('a refused command is still a Folder — its id comes back, so it is opened rather than made twice', async () => {
    s.createFolder.mockResolvedValue({ id: FOLDER.id, refusedAt: 1, result: { ok: false, reason: 'rate limited' } })
    expect(await createFolder('New')).toEqual({ ok: true, id: FOLDER.id, unlisted: 'rate limited' })
  })

  it('a rename passes the Folder and the name through — the channel is the only home (MAN-17)', async () => {
    s.renameFolder.mockResolvedValue({ ok: true })
    expect(await renameFolder(FOLDER, 'Renamed')).toEqual({ ok: true })
    expect(s.renameFolder).toHaveBeenCalledWith({ folder: FOLDER.id, name: 'Renamed' })
  })

  it('a refused rename is the relay’s reason', async () => {
    s.renameFolder.mockResolvedValue({ ok: false, reason: 'restricted' })
    expect(await renameFolder(FOLDER, 'Renamed')).toEqual({ ok: false, reason: 'restricted' })
  })
})

describe('Add to topic and Remove go on the wire as an entry on the topic (TOP-5)', () => {
  const TOPIC = { address: `30840:${'f'.repeat(64)}:topic-1`, folder: 'topic-folder' }
  const signed = () => {
    const sent: SignedEvent[] = []
    const relay = { publish: async (event: SignedEvent) => (sent.push(event), { ok: true }) } as unknown as Relay
    const signer = { pubkey: PK, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'e'.repeat(64), sig: '0'.repeat(128) }) } as unknown as Signer
    const real = new Store(relay, signer)
    s.setListedInTopic.mockImplementation((args: Parameters<Store['setListedInTopic']>[0]) => real.setListedInTopic(args))
    return sent
  }

  it('adding names the topic as the file it changes and the issue by its id, in the topic’s Folder, signed by whoever clicked', async () => {
    const sent = signed()
    expect(await setListedInTopic(TOPIC, ISSUE.id, true)).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    const [entry] = sent
    expect(entry.kind).toBe(1851)
    expect(entry.pubkey).toBe(PK)
    expect(entry.tags.filter((t) => t[0] !== 'ts')).toEqual([
      ['a', TOPIC.address],
      ['O', 'topic-1'],
      ['field', `lists:${ISSUE.id}`],
      ['value', 'true'],
      ['h', 'topic-folder'],
      ['o', ISSUE.id],
    ])
  })

  it('removing writes the same entry with value false, in the topic’s Folder, never the file’s own', async () => {
    const sent = signed()
    await setListedInTopic(TOPIC, PROJECT.id, false)
    const tags = sent[0].tags
    expect(tags).toContainEqual(['field', `lists:${PROJECT.id}`])
    expect(tags).toContainEqual(['value', 'false'])
    expect(tags).toContainEqual(['h', 'topic-folder'])
    expect(tags).not.toContainEqual(['h', PROJECT.contentFolder])
  })

  it('a refusal for someone outside the topic’s Folder is the relay’s reason', async () => {
    s.setListedInTopic.mockResolvedValue({ ok: false, reason: 'restricted: not a channel member' })
    expect(await setListedInTopic(TOPIC, ISSUE.id, true)).toEqual({ ok: false, reason: 'restricted: not a channel member' })
  })
})
