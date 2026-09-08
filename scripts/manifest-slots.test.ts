/**
 * The slot chain the publish check resolves with — fold, then tag, then
 * content, then the default.
 *
 * **This exists because the function was wrong and nothing could see it.** It
 * lived inside `publish-manifest.ts`, which calls `main()` at import, so it was
 * unreachable from a test; and it branched on `'tag' in slot` before anything
 * else, under a comment claiming it mirrored consumers "so the check and the
 * rendering cannot disagree". A slot that is both fold and tag — `{fold: "ref",
 * tag: "ref"}`, declared since PRO-11 — took the tag branch and returned the
 * seed, never the fold.
 *
 * It stayed invisible because it is only ever wrong for a *changed* field, and
 * the publish check builds a fresh object and changes exactly one thing: the
 * status, which is a bare fold and so never entered the tag branch.
 *
 *   npx tsx scripts/manifest-slots.test.ts
 */
import { manifestContent, resolveSlotValue, type SlotSource } from '../src/manifest'
import { KIND } from '../src/kinds'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const event = (tags: string[][], content = '') => ({ tags, content })
const changed = (value: string) => ({ value })

// ── The regression ─────────────────────────────────────────────────────────
const refSlot: SlotSource = { fold: 'ref', tag: 'ref' }
check(
  'a slot that is both fold and tag reads the change, not the seed',
  resolveSlotValue(refSlot, event([['ref', 'PRO-1']]), { ref: changed('PRO-99') }) === 'PRO-99',
  String(resolveSlotValue(refSlot, event([['ref', 'PRO-1']]), { ref: changed('PRO-99') })),
)
check(
  'and falls back to the seed when nothing has changed it',
  resolveSlotValue(refSlot, event([['ref', 'PRO-1']]), {}) === 'PRO-1',
)

// ── The content seed, PRO-2 ────────────────────────────────────────────────
const issueBody: SlotSource = { fold: 'description', field: 'content' }
check(
  'a folded body falls back to the event content',
  resolveSlotValue(issueBody, event([], 'written at creation'), {}) === 'written at creation',
)
check(
  'and a change wins over the content it was seeded from',
  resolveSlotValue(issueBody, event([], 'written at creation'), { description: changed('edited') }) === 'edited',
)

const projectBody: SlotSource = { fold: 'description', tag: 'description', field: 'content' }
check(
  'the tag sits between the fold and the content',
  resolveSlotValue(projectBody, event([['description', 'from the tag']], 'from the content'), {}) === 'from the tag',
  // `projectDescription()` in fold.ts takes the tag at its word even when
  // something also left content behind. The declaration has to say the same.
)
check(
  'and content answers when the tag is absent',
  resolveSlotValue(projectBody, event([], 'from the content'), {}) === 'from the content',
)

// ── The parts that were already right ──────────────────────────────────────
check(
  'an empty tag value is skipped rather than accepted as an answer',
  resolveSlotValue({ tag: ['name', 'title'] }, event([['name', ''], ['title', 'Second spelling']]), {}) ===
    'Second spelling',
)
check(
  'a children slot resolves to nothing here — it is a query, not a value',
  resolveSlotValue({ children: { kind: KIND.ISSUE, via: 'a' } }, event([], 'x'), {}) === undefined,
)
check(
  'a default answers only when the whole chain is empty',
  resolveSlotValue({ fold: 'status', default: 'todo' }, event([], ''), {}) === 'todo',
)

// ── The declarations this file is about, as published ──────────────────────
// Reading them from the manifest rather than restating them: a test that
// asserts a shape it wrote itself cannot notice the manifest changing.
const published = manifestContent()
for (const kind of [KIND.PROJECT, KIND.ISSUE]) {
  const slot = published.projections[String(kind)]?.slots.body as SlotSource | undefined
  check(`kind:${kind} declares a body slot`, !!slot && 'fold' in slot && 'field' in slot, JSON.stringify(slot))
}

/*
  Every slot Ship *changes* must name the field it changes.

  A consumer defaults the folded field to the slot's first tag name, so a slot
  whose tag spelling differs from its change field silently folds a field
  nothing writes and falls back to the root tag — which means the value at
  creation, for ever. That is not hypothetical: `title` on a project declared
  `tag: ['name','title']` and no `fold`, so 6 of 19 production projects showed
  the name they were created with in every app except Ship, 3 of them blank.

  Ship cannot catch this by using its own objects: its fold reads the field
  directly and never consults the manifest. Only a consumer sees it, and only
  after a rename — which is why it is asserted here, against the published
  declaration, rather than left to a rendering test.
*/
/** The field a consumer will fold, given a declaration — interop's rule, restated. */
function foldedFieldOf(slot: SlotSource | undefined): string | undefined {
  if (!slot) return undefined
  if ('fold' in slot && slot.fold) return slot.fold
  // The default a consumer applies when no `fold` is named: the first tag.
  // Restating it here rather than importing it is deliberate — this test is
  // about what a *stranger* would conclude from the published declaration.
  if ('tag' in slot && slot.tag) return Array.isArray(slot.tag) ? slot.tag[0] : slot.tag
  return undefined
}

for (const [kind, field] of [
  [KIND.PROJECT, 'title'],
  [KIND.ISSUE, 'title'],
] as const) {
  const slot = published.projections[String(kind)]?.slots.title as SlotSource | undefined
  const declared = foldedFieldOf(slot)
  check(
    `kind:${kind} folds the field its rename actually writes (${field})`,
    declared === field,
    `declared ${JSON.stringify(declared)}`,
  )
}

console.log(failures === 0 ? '\nAll slot-chain checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
