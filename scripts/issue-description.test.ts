/**
 * `add-issue` takes a description, and all three places that had to agree.
 *
 * **The trap this file guards.** The runtime writes each declared property to a
 * tag of its own name (`buildCreationEvent` in `@estiva-app/interop`), so an
 * issue filed from a foreign consumer arrives carrying `["description", …]` and
 * an **empty content**. Ship's own composer does the opposite — `buildIssue`
 * puts the body in `content` and writes no such tag — and before this change
 * both of Ship's readers only knew about content:
 *
 *   1. `add-issue`'s `input`, which had no description property at all
 *   2. `fold.ts`, which read an issue's as `fields.description ?? event.content`
 *   3. the issue projection's `body` slot, `{fold, field}` with no `tag`
 *
 * Declaring (1) without (2) and (3) publishes a description that is on the
 * event, correct, and rendered nowhere — by Ship's own UI or by anybody else's.
 * Nothing would have failed; the issues would just have been blank. So each of
 * the three is asserted here rather than trusted.
 *
 *   npx tsx scripts/issue-description.test.ts
 */
import { foldFolder } from '../src/nostr/fold'
import { manifestContent, resolveSlotValue, type SlotSource } from '../src/nostr/manifest'
import { KIND } from '../src/nostr/kinds'
import { buildActionEvent } from '@estiva-app/interop'
import { BLOCK_DOCUMENT_FORMAT, markerTextToBlockDocument, serializeBlockDocument, type SignedEvent } from '@estiva-app/protocol'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const FOLDER = 'b53d6116-a156-4cb5-9802-900be8809780'
const AUTHOR = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'

/** An issue root event, however the description was carried. */
function issue(opts: { id: string; tags?: string[][]; content?: string }): SignedEvent {
  return {
    id: `e${opts.id}`.padEnd(64, '0'),
    pubkey: AUTHOR,
    created_at: 1_756_000_000,
    kind: KIND.ISSUE,
    tags: [['d', opts.id], ['title', 'Billing entry'], ['h', FOLDER], ...(opts.tags ?? [])],
    content: opts.content ?? '',
    sig: 'f'.repeat(128),
  } as SignedEvent
}

const only = (events: SignedEvent[]) => foldFolder(events).issues[0]

// ── 1. The declaration ─────────────────────────────────────────────────────
const manifest = manifestContent()
/*
  Cast, because `ManifestContent.actions` is `unknown[]` on purpose — Ship is
  the producer and the type deliberately does not constrain what it publishes.
  `app.test.ts` reads it the same way.
*/
const addIssue = (manifest as unknown as {
  actions: { id: string; input?: { properties?: Record<string, unknown>; required?: string[] } }[]
}).actions.find((a) => a.id === 'add-issue')
const properties = addIssue?.input?.properties
const required = addIssue?.input?.required ?? []

check('add-issue declares a description', !!properties?.description, Object.keys(properties ?? {}).join(', '))
check(
  'and it is NOT required — a title-only capture must still work',
  !required.includes('description'),
  `required = ${required.join(', ')}`,
)
check('while the title still is', required.includes('title'))

// ── 2. The fold ────────────────────────────────────────────────────────────
check(
  'an issue reads its description from a `description` tag',
  only([issue({ id: 'i1', tags: [['description', 'From the conversation']] })]).description ===
    'From the conversation',
  only([issue({ id: 'i1', tags: [['description', 'From the conversation']] })]).description,
)
check(
  'and still from `.content`, which is where Ship’s own composer puts it',
  only([issue({ id: 'i2', content: 'Typed in Ship' })]).description === 'Typed in Ship',
)
check(
  'the tag wins over content, so a record carrying it is taken at its word',
  only([issue({ id: 'i3', tags: [['description', 'the tag']], content: 'the content' })]).description ===
    'the tag',
)
check(
  'an issue with neither has an empty description rather than a crash',
  only([issue({ id: 'i4' })]).description === '',
)

/*
  A later edit still wins over the root, which is the ordering that makes the
  root the *original* body rather than the current one. Asserted because adding
  the tag read in the wrong position — before the fold rather than after —
  would silently freeze every issue at the text it was filed with.
*/
const edit: SignedEvent = {
  id: 'c'.repeat(64),
  pubkey: AUTHOR,
  created_at: 1_756_000_100,
  kind: KIND.CHANGE,
  tags: [
    ['a', `${KIND.ISSUE}:${AUTHOR}:i5`],
    ['field', 'description'],
    ['value', 'Edited afterwards'],
    ['h', FOLDER],
  ],
  content: '',
  sig: 'f'.repeat(128),
} as SignedEvent
check(
  'a change beats the tag, so the root holds the original and not the current',
  only([issue({ id: 'i5', tags: [['description', 'As filed']] }), edit]).description === 'Edited afterwards',
  only([issue({ id: 'i5', tags: [['description', 'As filed']] }), edit]).description,
)

// ── 3. The projection every other consumer renders from ────────────────────
const body = manifest.projections?.[String(KIND.ISSUE)]?.slots?.body as SlotSource | undefined
/*
  `SlotSource` is a union and only its tag-shaped member carries `tag`, so the
  chain is read through its own shape rather than narrowed — the assertion is
  about what was declared, not about which union member TypeScript picks.
*/
const chain = body as { fold?: string; tag?: string; field?: string } | undefined
check('the issue projection declares the tag in its body chain', chain?.tag === 'description', JSON.stringify(body))
check(
  'and resolves a tag-carried description, which is what a foreign consumer sees',
  resolveSlotValue(body!, { tags: [['description', 'From the conversation']], content: '' }, {}) ===
    'From the conversation',
)
check(
  'identical to the project’s chain, which had the tag all along',
  JSON.stringify(manifest.projections?.[String(KIND.PROJECT)]?.slots?.body) === JSON.stringify(body),
)

// ── 4. A block document, built from this declaration (MAN-1, RIC-13) ───────
/*
  What Peek does, with the runtime Peek uses: `buildActionEvent` reads this
  manifest and is handed `contentFormat` because the declaration says the
  description may be a block document. The fold must then read it as blocks —
  the issue page draws a document, not the JSON of one.
*/
const PROJECT = `${KIND.PROJECT}:${AUTHOR}:p1`
const document = serializeBlockDocument(markerTextToBlockDocument('# Why\nThe **total** is wrong'))
const build = (value: Record<string, string>, contentFormat?: string) =>
  buildActionEvent({
    manifest: manifest as unknown as Parameters<typeof buildActionEvent>[0]['manifest'],
    kind: KIND.PROJECT,
    address: PROJECT,
    objectAuthor: AUTHOR,
    folder: FOLDER,
    actionId: 'add-issue',
    value,
    newId: 'i6',
    contentFormat,
    pubkey: AUTHOR,
    createdAtMs: 1_756_000_200_000,
  })
const built = build({ title: 'Billing entry', description: document }, BLOCK_DOCUMENT_FORMAT)
check('the runtime builds add-issue with a block-document description', typeof built !== 'string', typeof built === 'string' ? built : '')
if (typeof built !== 'string') {
  check('into the content, where Ship’s own composer puts it', built.content === document)
  check('tagged content-format: estiva-blocks-1', built.tags.some((t) => t[0] === 'content-format' && t[1] === BLOCK_DOCUMENT_FORMAT))
  check('and not also as a description tag', !built.tags.some((t) => t[0] === 'description'))
  const folded = only([{ ...built, id: 'd'.repeat(64), sig: 'f'.repeat(128) } as SignedEvent])
  check('which Ship folds as blocks', folded.descriptionFormat === 'blocks', folded.descriptionFormat)
  check('with the document as its description', folded.description === document)
}
const titleOnly = build({ title: 'Billing entry' })
check(
  'a title-only capture still builds, with no body and no format',
  typeof titleOnly !== 'string' && titleOnly.content === '' && !titleOnly.tags.some((t) => t[0] === 'content-format'),
  typeof titleOnly === 'string' ? titleOnly : '',
)

console.log(`\n${failures === 0 ? 'add-issue’s description is readable by every reader.' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
