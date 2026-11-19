/**
 * Issues written in order (ISS-5), at the wire: the events Ship signs with the
 * issues switch on, against a relay held in memory that keeps issues in order
 * as SPEC §6.2 says — a change whose `prev` is not its field's current change
 * is refused `conflict: <field> follows <id>`, a first record carrying text is
 * refused `text-is-a-change`, and a `kind:5` of an issue `delete-by-field`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLOCK_DOCUMENT_FORMAT, serializeBlockDocument, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'

const PK = 'ab'.repeat(32)
const OTHER = 'cd'.repeat(32)
const FOLDER = '3167adea-877f-43c4-96fb-517a2b2d5d24'

let held: SignedEvent[] = []
let count = 0
/** How many times reads (§6.13) the relay was asked, each from its first page: the deleted issues' read. */
let timesReads = 0
/** Refuse the next change to this field once, with this reason: a text that did not land. */
let refuseOnce: { field: string; reason: string } | undefined
/** Before answering the next change to this field, someone else's lands first: a save from another copy. */
let beatenBy: { field: string; event: SignedEvent } | undefined

const tagOf = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const dOf = (event: SignedEvent) => tagOf(event, 'd')
const addrOf = (event: SignedEvent) => `${event.kind}:${event.pubkey}:${dOf(event)}`
const isChange = (event: SignedEvent) => event.kind === 1851

const later = (x: SignedEvent, y: SignedEvent) => x.created_at > y.created_at || (x.created_at === y.created_at && x.id > y.id)

/** Each field's current change of `addr`, by §6.3's order. */
function newestFields(addr: string): Map<string, SignedEvent> {
  const newest = new Map<string, SignedEvent>()
  for (const event of held) {
    if (!isChange(event) || tagOf(event, 'a') !== addr) continue
    const field = tagOf(event, 'field')!
    const before = newest.get(field)
    if (!before || later(event, before)) newest.set(field, event)
  }
  return newest
}

const deletedNow = (addr: string) => tagOf(newestFields(addr).get('deleted') ?? ({ tags: [] } as unknown as SignedEvent), 'value') === 'true'

function answer(filters: Record<string, unknown>[]): SignedEvent[] {
  const out = new Set<SignedEvent>()
  for (const f of filters) {
    const kinds = f.kinds as number[] | undefined
    const matches = (event: SignedEvent) =>
      (!kinds || kinds.includes(event.kind)) &&
      (!f['#d'] || (f['#d'] as string[]).includes(dOf(event) ?? '')) &&
      (!f['#a'] || (f['#a'] as string[]).includes(tagOf(event, 'a') ?? '')) &&
      (!f['#h'] || (f['#h'] as string[]).includes(tagOf(event, 'h') ?? '')) &&
      (!f.ids || (f.ids as string[]).includes(event.id))
    if (f.fields === 'newest') {
      for (const root of held.filter((event) => !isChange(event) && matches(event))) {
        if (deletedNow(addrOf(root))) continue
        out.add(root)
        for (const [field, change] of newestFields(addrOf(root))) if (f.text === true || field !== 'description') out.add(change)
      }
      continue
    }
    for (const event of held.filter(matches)) out.add(event)
  }
  return [...out]
}

/** The times read (§6.13): one row per first record, deleted ones included, its current changes' ids and fields. */
function times(filters: Record<string, unknown>[]) {
  const f = filters[0]!
  const until = f.until as number | undefined
  // A read starts with no cursor; its later pages carry one.
  if (until === undefined) timesReads++
  return held
    .filter((event) => (f.kinds as number[]).includes(event.kind) && (until === undefined || event.created_at <= until))
    .map((root) => ({
      a: addrOf(root),
      created_at: root.created_at,
      h: tagOf(root, 'h') ?? null,
      changes: [...newestFields(addrOf(root))].map(([field, change]) => ({ id: change.id, created_at: change.created_at, fields: [field] })),
    }))
}

/** What the relay answers a publish, by the rules issues are kept by once switched. */
function judge(event: SignedEvent): { ok: boolean; reason?: string } {
  if (event.kind === 5) return { ok: false, reason: 'invalid: delete-by-field: an issue is deleted by its deleted field, not kind 5' }
  if (event.kind === 30851 && event.content !== '') return { ok: false, reason: "invalid: text-is-a-change: an issue's first record carries no text" }
  if (!isChange(event)) return { ok: true }
  const field = tagOf(event, 'field')!
  if (beatenBy?.field === field) {
    held.push(beatenBy.event)
    beatenBy = undefined
  }
  if (refuseOnce?.field === field) {
    const { reason } = refuseOnce
    refuseOnce = undefined
    return { ok: false, reason }
  }
  const target = tagOf(event, 'a')!
  const current = newestFields(target).get(field)
  const rootId = held.find((e) => !isChange(e) && addrOf(e) === target)?.id
  const prev = tagOf(event, 'prev')
  if (!prev) return { ok: false, reason: 'invalid: requires-prev: an issue change names the change it follows in prev' }
  if (prev !== (current?.id ?? rootId)) return { ok: false, reason: `conflict: ${field} follows ${current?.id ?? rootId}` }
  return { ok: true }
}

const sent: SignedEvent[] = []

vi.mock('./store', async () => {
  const { Store } = await import('../nostr/store')
  const signer = {
    pubkey: PK,
    // Ids grow with each signature, so a later change sorts after an earlier one in the same second.
    sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: (0x1000 + ++count).toString(16).padStart(64, '0'), sig: '0'.repeat(128) }),
  }
  const relay = {
    query: async (filters: Record<string, unknown>[]) => answer(filters),
    queryAll: async (filters: Record<string, unknown>[]) => answer(filters),
    queryTimes: async (filters: Record<string, unknown>[]) => times(filters),
    publish: async (event: SignedEvent) => {
      sent.push(event)
      const verdict = judge(event)
      if (verdict.ok) held.push(event)
      return verdict
    },
  }
  const on = async () => ({ text: true })
  const inOrderOption = async () => ({ inOrder: ['osnova.project', 'osnova.issue'] })
  return {
    relay,
    signer,
    projectFieldsNow: on,
    projectFieldsAgain: on,
    issueFieldsNow: on,
    issueFieldsAgain: on,
    inOrderOption,
    store: new Store(relay as never, signer as never, async () => 0, on, async () => ['osnova.project', 'osnova.issue'], on),
  }
})
vi.mock('./clock', () => ({ clockProblem: async () => undefined }))

const { assignMissingRefs, createIssue, createProject, deleteIssue, noteFileText, readDeletedIssues, readIssueByLink, setIssueDeleted, setIssueField } = await import('./writes')
const { foldFolder } = await import('../nostr/fold')
const { foldWorkspace } = await import('../nostr/store')

const project = { addr: `30850:${PK}:p`, id: 'p', title: 'Payments', key: 'PAY', contentFolder: FOLDER, createdAt: 1, fields: {} } as never

const issueRoot = (d: string, ref?: string, at = 100, pubkey = PK): SignedEvent =>
  ({ id: `r${d}`.padEnd(64, '0'), kind: 30851, pubkey, created_at: at, content: '', sig: '0'.repeat(128), tags: [['d', d], ['title', d], ['h', FOLDER], ['a', `30850:${PK}:p`], ...(ref ? [['ref', ref]] : [])] }) as SignedEvent

const change = (d: string, id: string, field: string, value: string, at: number, prev: string, by = OTHER, format?: string): SignedEvent =>
  ({
    id: id.padEnd(64, '0'),
    kind: 1851,
    pubkey: by,
    created_at: at,
    content: '',
    sig: '0'.repeat(128),
    tags: [['a', `30851:${PK}:${d}`], ['O', d], ['field', field], ['value', value], ['h', FOLDER], ['prev', prev], ...(format ? [['content-format', format]] : [])],
  }) as SignedEvent

const doc = (...blocks: [string, string][]) => serializeBlockDocument({ type: 'doc', content: blocks.map(([id, text]) => ({ type: 'paragraph', id, content: [{ type: 'text', text }] })) } as never)

/** The issue as a page holding every event so far would show it. */
const issueNow = (d: string) => foldFolder(held).issues.find((issue) => issue.id === d)!

beforeEach(() => {
  held = []
  sent.length = 0
  refuseOnce = undefined
  beatenBy = undefined
})

describe('an issue field, with the issues switch on', () => {
  it("follows the field's current change, so a status set from an old copy is never written blind", async () => {
    const status = change('i', 'c1', 'status', 'todo', 110, issueRoot('i').id)
    held = [issueRoot('i'), status]
    expect(await setIssueField(issueNow('i'), 'status', 'in_progress', 'Status')).toEqual({ ok: true })
    expect(sent.at(-1)!.tags).toContainEqual(['prev', status.id])
  })

  it('lands both people\'s changes to different fields made from the same copy', async () => {
    held = [issueRoot('i')]
    const copy = issueNow('i')
    // Someone set the assignee after this copy was read; this tab sets the status from it.
    held.push(change('i', 'a1', 'assignee', OTHER, 120, issueRoot('i').id))
    expect(await setIssueField(copy, 'status', 'in_progress', 'Status')).toEqual({ ok: true })
    const now = issueNow('i')
    expect([now.status, now.assignee]).toEqual(['in_progress', OTHER])
  })

  it('keeps the later of two status saves from one copy, and both stay in its history', async () => {
    held = [issueRoot('i')]
    const copy = issueNow('i')
    beatenBy = { field: 'status', event: change('i', 'b1', 'status', 'done', 120, issueRoot('i').id) }
    expect(await setIssueField(copy, 'status', 'in_progress', 'Status')).toEqual({ ok: true })
    expect(issueNow('i').status).toBe('in_progress')
    expect(held.filter((e) => isChange(e) && tagOf(e, 'field') === 'status').map((e) => tagOf(e, 'value'))).toEqual(['done', 'in_progress'])
  })

  it('merges a text someone saved since when they changed another block, without asking', async () => {
    const mine0 = change('i', 'd1', 'description', doc(['p1', 'Alpha'], ['p2', 'Beta']), 110, issueRoot('i').id, PK, BLOCK_DOCUMENT_FORMAT)
    held = [issueRoot('i'), mine0]
    const copy = issueNow('i')
    noteFileText(copy)
    beatenBy = { field: 'description', event: change('i', 'd2', 'description', doc(['p1', 'Alpha, theirs'], ['p2', 'Beta']), 120, mine0.id, OTHER, BLOCK_DOCUMENT_FORMAT) }
    const result = await setIssueField(copy, 'description', doc(['p1', 'Alpha'], ['p2', 'Beta, mine']), 'Description', BLOCK_DOCUMENT_FORMAT, { content: copy.description, format: BLOCK_DOCUMENT_FORMAT } as never)
    expect(result).toEqual({ ok: true })
    expect(issueNow('i').description).toContain('Alpha, theirs')
    expect(issueNow('i').description).toContain('Beta, mine')
  })

  it('asks about a block both changed, and saves nothing', async () => {
    const mine0 = change('i', 'd1', 'description', doc(['p1', 'Alpha']), 110, issueRoot('i').id, PK, BLOCK_DOCUMENT_FORMAT)
    held = [issueRoot('i'), mine0]
    const copy = issueNow('i')
    noteFileText(copy)
    beatenBy = { field: 'description', event: change('i', 'd2', 'description', doc(['p1', 'Alpha, theirs']), 120, mine0.id, OTHER, BLOCK_DOCUMENT_FORMAT) }
    const result = await setIssueField(copy, 'description', doc(['p1', 'Alpha, mine']), 'Description', BLOCK_DOCUMENT_FORMAT, { content: copy.description, format: BLOCK_DOCUMENT_FORMAT } as never)
    expect(result.ok).toBe(false)
    expect('asks' in result).toBe(true)
    expect(issueNow('i').description).toContain('Alpha, theirs')
    expect(sent.filter((e) => isChange(e) && tagOf(e, 'field') === 'description')).toHaveLength(1)
  })
})

describe('a new issue', () => {
  it('is a first record with no text, then its text as its first change, numbered once', async () => {
    held = [issueRoot('one', 'PAY-1')]
    const result = await createIssue(project, { projects: [project], issues: [issueNow('one')] }, { title: 'Two', description: 'Its words' })
    expect(result.ok).toBe(true)
    const [record, text] = sent
    expect(record!.kind).toBe(30851)
    expect(record!.content).toBe('')
    expect(tagOf(record!, 'ref')).toBe('PAY-2')
    expect([text!.kind, tagOf(text!, 'field'), tagOf(text!, 'value'), tagOf(text!, 'prev')]).toEqual([1851, 'description', 'Its words', record!.id])
    expect(sent.filter((e) => e.kind === 1851 && tagOf(e, 'field') === 'ref')).toEqual([])
  })

  it("never takes a deleted issue's number", async () => {
    held = [issueRoot('one', 'PAY-1'), issueRoot('gone', 'PAY-2'), change('gone', 'x1', 'deleted', 'true', 120, issueRoot('gone').id)]
    // A tab opened now: its one read of the deleted issues is this one.
    await readDeletedIssues(true)
    // The page holds only the live one: the deleted one leaves every list.
    await createIssue(project, { projects: [project], issues: [issueNow('one')] }, { title: 'Three', description: '' })
    expect(tagOf(sent[0]!, 'ref')).toBe('PAY-3')
  })

  it('reads the deleted issues once per tab, and again after this tab deletes one', async () => {
    held = [issueRoot('one', 'PAY-1')]
    await readDeletedIssues(true)
    timesReads = 0
    await createIssue(project, { projects: [project], issues: foldFolder(held).issues }, { title: 'Two', description: '' })
    await createIssue(project, { projects: [project], issues: foldFolder(held).issues }, { title: 'Three', description: '' })
    expect(timesReads).toBe(0)
    // The page heard one deleted while open: it is counted without a read.
    const two = foldFolder(held).issues.find((issue) => issue.ref === 'PAY-3')!
    expect(await deleteIssue(two)).toEqual({ ok: true })
    sent.length = 0
    const gone = foldWorkspace({ events: held, folders: [FOLDER], readAt: {}, threadsAt: {}, mentionsOf: [] } as never)
    await createIssue(project, { projects: [project], issues: gone.issues, deletedIssues: gone.deletedIssues }, { title: 'Four', description: '' })
    expect(timesReads).toBe(1)
    expect(tagOf(sent[0]!, 'ref')).toBe('PAY-4')
  })

  it('sends no text when Create again picks another project than the one it was created in', async () => {
    refuseOnce = { field: 'description', reason: 'invalid: blocked for the test' }
    const first = await createIssue(project, { projects: [project], issues: [] }, { title: 'Two', description: 'Private words' })
    sent.length = 0
    const elsewhere = { ...(project as object), addr: `30850:${PK}:q`, contentFolder: 'f0f0f0f0-0000-4000-8000-000000000000' } as never
    const again = await createIssue(elsewhere, { projects: [project, elsewhere], issues: [] }, { title: 'Two', description: 'Private words' }, !first.ok ? first.unfinished : undefined)
    expect(again.ok).toBe(false)
    expect(sent).toEqual([])
  })

  it('keeps the words when the text did not land, and Create again sends the text, never a second issue', async () => {
    refuseOnce = { field: 'description', reason: 'invalid: blocked for the test' }
    const first = await createIssue(project, { projects: [project], issues: [] }, { title: 'Two', description: 'Its words' })
    expect(first.ok).toBe(false)
    expect(!first.ok && first.unfinished).toBeTruthy()
    sent.length = 0
    const again = await createIssue(project, { projects: [project], issues: [] }, { title: 'Two', description: 'Its words' }, !first.ok ? first.unfinished : undefined)
    expect(again.ok).toBe(true)
    expect(sent.map((e) => [e.kind, tagOf(e, 'field')])).toEqual([[1851, 'description']])
  })
})

describe('a new project, where projects are kept in order', () => {
  it('is a first record with no text, then its text as its first change', async () => {
    const result = await createProject({ title: 'Launch', description: 'What launch means', key: 'LAU', team: { folder: FOLDER, hasState: true } })
    expect(result.ok).toBe(true)
    const [record, text] = sent
    expect(record!.kind).toBe(30850)
    expect(tagOf(record!, 'description')).toBeUndefined()
    expect([tagOf(text!, 'field'), tagOf(text!, 'value'), tagOf(text!, 'prev')]).toEqual(['description', 'What launch means', record!.id])
  })
})

describe('deleting an issue', () => {
  it('is a `deleted` change after the one it follows, never a kind:5, and Restore brings it back with its number', async () => {
    held = [issueRoot('i', 'PAY-7')]
    expect(await deleteIssue(issueNow('i'))).toEqual({ ok: true })
    expect(sent.map((e) => e.kind)).toEqual([1851])
    expect([tagOf(sent[0]!, 'field'), tagOf(sent[0]!, 'value'), tagOf(sent[0]!, 'prev')]).toEqual(['deleted', 'true', issueRoot('i').id])

    const gone = foldWorkspace({ events: held, folders: [FOLDER], readAt: {}, threadsAt: {}, mentionsOf: [] } as never)
    expect(gone.issues).toEqual([])
    expect(gone.deletedIssues!.map((issue) => [issue.ref, issue.deleted!.by])).toEqual([['PAY-7', PK]])

    expect((await readDeletedIssues(true)).map((issue) => issue.ref)).toEqual(['PAY-7'])
    // Its link still opens it, with who deleted it: no list read carries it.
    expect((await readIssueByLink('i'))?.deleted?.by).toBe(PK)

    expect(await setIssueDeleted(issueNow('i'), false)).toEqual({ ok: true })
    const back = foldWorkspace({ events: held, folders: [FOLDER], readAt: {}, threadsAt: {}, mentionsOf: [] } as never)
    expect(back.issues.map((issue) => issue.ref)).toEqual(['PAY-7'])
  })
})

describe('numbering an issue another app filed without a ref', () => {
  it("takes the ref someone set since and does not claim again (SPEC §6.1)", async () => {
    held = [issueRoot('i', undefined, 100, OTHER)]
    const seen = foldFolder(held).issues
    beatenBy = { field: 'ref', event: { ...change('i', 'r1', 'ref', 'PAY-9', 120, issueRoot('i', undefined, 100, OTHER).id), tags: [['a', `30851:${OTHER}:i`], ['O', 'i'], ['field', 'ref'], ['value', 'PAY-9'], ['h', FOLDER], ['prev', issueRoot('i', undefined, 100, OTHER).id]] } as SignedEvent }
    const results = await assignMissingRefs(project, { projects: [project], issues: seen })
    expect(results.map((r) => r.ok)).toEqual([false])
    const claims = sent.filter((e) => tagOf(e, 'field') === 'ref')
    expect(claims.map((e) => tagOf(e, 'prev'))).toEqual([issueRoot('i', undefined, 100, OTHER).id])
    expect(foldFolder(held).issues[0]!.ref).toBe('PAY-9')
  })
})
