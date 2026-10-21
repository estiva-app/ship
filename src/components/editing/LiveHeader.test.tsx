// Moved from src/components/Description.test.tsx and src/components/ProjectHeader.test.tsx
/**
 * A description shows the object it points at, not the pointer — PRO-7.
 *
 * The behaviour was once assembled by hand at two call sites and one of them
 * was assembled wrong: an issue's description stripped its `nostr:naddr…` and
 * drew the object below; a project's did neither. Both surfaces passed every
 * test, because nothing was *broken* — one simply lacked a feature the other
 * had, and no test knew they were meant to match. Both pages mount `LiveHeader`
 * now, so the assertions here are about the pairing, in one place.
 *
 * Changed on purpose (Katerina, 29 September): there is no reading/writing
 * switch. A writer gets the editor from the start (once its chunk has loaded),
 * and a reader who cannot write gets text. So each reading assertion is made on
 * both where it applies: the reader's text, and the writer's editor.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The reference resolver reaches the relay. What is under test is which text
// reaches the screen, so it is stubbed to resolve nothing and the prose is
// unaffected either way. Only the network call is stubbed: a standalone
// reference renders `ForeignObject`, which needs the rest of this module.
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { resolveForeign, type ForeignObject } from '@/api/foreign'
import { LiveHeader } from './LiveHeader'

const ISSUE: ForeignObject = {
  ref: '30851:pk:d',
  eventId: 'e'.repeat(64),
  kind: 30851,
  widget: 'row',
  appName: 'Ship',
  openUrl: 'https://ship.estiva.app/issue/d',
  slots: { title: { value: 'The probe issue' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: false,
}

/* jsdom implements neither `getClientRects` nor `getBoundingClientRect` on text
   nodes, and ProseMirror calls them when it scrolls the caret into view. Without
   these the call can land after a test has finished, as an unhandled error that
   fails the whole run while every test passes (seen under load, UIG-14). The
   same stand-in as `LiveDescription.test.tsx`. */
beforeAll(() => {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
  const empty = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  for (const proto of [Element.prototype, Range.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects = rects
    proto.getBoundingClientRect = empty
  }
})

const NADDR =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'

type Format = 'marker' | 'blocks' | 'unknown'

const header = (description: string, format: Format, readOnly: boolean) => (
  <LiveHeader
    title="Relay Migration"
    titlePlaceholder="Untitled"
    onRename={vi.fn(() => true)}
    description={description}
    format={format}
    onDescribe={vi.fn(() => true)}
    readOnly={readOnly}
  />
)

/* A reader who cannot write: the reading surface, text and no editor. */
const read = (description: string, format: Format = 'marker') => render(header(description, format, true)).container

/*
  A writer: the editor. `findBy`, because the editor is a lazy chunk — a reader
  never downloads ProseMirror — and in a full run it has taken 1.1–1.7s against
  findBy's 1s default (the flake of 2026-09-09, three times). What is returned is
  the description's own editor, so the title's text is not in what is measured.
*/
const write = async (description: string, format: Format = 'marker') => {
  render(header(description, format, false))
  return screen.findByRole('textbox', { name: 'Description' })
}

/** The description's area on the reading surface: the block under the title row. */
const readDescription = (c: HTMLElement) => c.querySelector('[data-description="reading"]') as HTMLElement

describe('LiveHeader draws its description (from Description.test.tsx)', () => {
  /*
    RIC-9 asserted that no `naddr1` appeared in the prose at all, because every
    pointer was cut out of the body before rendering. RIC-10 changes that
    deliberately: a pointer *inside a sentence* is now drawn in place, so the
    sentence survives.

    The property that still holds, and the one worth asserting, is that a reader
    never sees a raw full-length pointer. Unresolved it is a shortened chip
    (§13.1: never blank); resolved it is the object's title.
  */
  it('draws a mid-sentence pointer in place, keeping the sentence', () => {
    const d = readDescription(read(`See ${NADDR} for the detail.`))
    expect(d.textContent).toContain('See')
    expect(d.textContent).toContain('for the detail.')
    expect(d.querySelector('[data-reference]')).not.toBeNull()
    // Shortened, not the 200-character pointer the author typed.
    expect(d.textContent!.length).toBeLessThan(NADDR.length)
  })

  it('draws a pointer that is the whole paragraph as its chip, with no card', () => {
    // Changed on purpose (Widgets, SPEC §13.3): alone on its line it is its
    // chip, as in a sentence, and a card comes only from the writer's choice.
    const c = read(NADDR)
    expect(c.querySelector('[data-reference]')).not.toBeNull()
    expect(c.querySelector('[data-foreign-object]')).toBeNull()
    expect(c.textContent).not.toContain(NADDR.slice(6))
  })

  it('draws the card a writer chose after the line that holds its chip, and none for a chip with none', async () => {
    vi.mocked(resolveForeign).mockImplementation(async () => ISSUE)
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', id: 'p1', content: [{ type: 'text', text: 'Blocked by ' }, { type: 'text', text: NADDR, marks: [{ type: 'reference', attrs: { uri: NADDR, embed: 'detailed' } }] }] },
        { type: 'paragraph', id: 'p2', content: [{ type: 'text', text: 'after' }] },
        { type: 'paragraph', id: 'p3', content: [{ type: 'text', text: NADDR, marks: [{ type: 'reference', attrs: { uri: NADDR } }] }] },
      ],
    })
    const c = read(doc, 'blocks')
    await waitFor(() => expect(c.querySelectorAll('[data-card]')).toHaveLength(1))
    const card = c.querySelector('[data-card]')!
    expect(card.getAttribute('data-card')).toBe('detailed')
    // After the first paragraph, before the second: under its line, not under the description.
    const first = c.querySelector('[data-block-id="p1"]')!
    const second = c.querySelector('[data-block-id="p2"]')!
    expect(first.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    vi.mocked(resolveForeign).mockImplementation(async () => null)
  })

  it('draws the chosen card in the editor too, after its line', async () => {
    vi.mocked(resolveForeign).mockImplementation(async () => ISSUE)
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', id: 'p1', content: [{ type: 'text', text: NADDR, marks: [{ type: 'reference', attrs: { uri: NADDR, embed: 'compact' } }] }] }],
    })
    const editor = await write(doc, 'blocks')
    await waitFor(() => expect(editor.querySelector('[data-reference-cards] [data-card]')?.getAttribute('data-card')).toBe('compact'))
    vi.mocked(resolveForeign).mockImplementation(async () => null)
  })

  // Changed on purpose: no click opens the editor — a writer has it from the start.
  it('gives the writer an editor that still holds the pointer, drawn as what it points at', async () => {
    /*
      The pointer is hidden from the *reading* and never from the author: a
      naive `value={stripped}` would delete it the first time anyone edited
      around it.

      RIC-14 changes how that is checked rather than whether. There is no
      second string any more — the editor holds the same document the reader
      does — so the assertion is that the reference is still *in* the editor,
      as the chip it is drawn as, instead of reappearing as raw bech32 the
      moment a person clicks. That difference was the whole report.
    */
    const editor = await write(`See ${NADDR} for the detail.`)
    expect(editor.textContent).toContain('See')
    expect(editor.textContent).toContain('for the detail.')
    // A node view is a React portal, so it lands a tick after the editor does.
    await waitFor(() => expect(editor.querySelector('[data-reference]')).not.toBeNull())
    // Not the 200-character pointer, which is what a textarea showed.
    expect(editor.textContent!.length).toBeLessThan(NADDR.length)
  })

  it('shows the placeholder when there is nothing yet', async () => {
    await write('')
    expect(document.body.textContent).toContain('Add a description…')
  })

  it('offers no edit affordance to a reader who cannot write', async () => {
    const c = read('text')
    // No focusable surface either: a reader who cannot write gets no way in (D37).
    expect(c.querySelector('[tabindex="0"]')).toBeNull()
    expect(c.querySelector('[contenteditable]')).toBeNull()
    // And clicking the prose does nothing: the affordance is the only way in,
    // so removing it has to remove the capability rather than only the button.
    fireEvent.click(screen.getByText('text'))
    // Given the time the editor's chunk takes to arrive, so an absent editor is the answer and not the moment before it.
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull()
  })
})

/**
 * The project description is drawn, not spelled out (from ProjectHeader.test.tsx).
 *
 * This exists because the first cut of RIC-6 wired `IssueView` and not the
 * project header, every suite passed, and the surface holding the **longest**
 * real description in the workspace — 6,446 characters of headings, lists and
 * code spans — still rendered every marker as a character. Nothing failed; it
 * was only visible by opening the page.
 */
describe.each([
  ['a reader', async (description: string, format?: Format) => readDescription(read(description, format))],
  ['a writer', write],
] as const)('LiveHeader draws its description for %s (from ProjectHeader.test.tsx)', (_who, show) => {
  it('renders structure as elements', async () => {
    const c = await show('# Heading\n\n- one\n- two\n\nand `code`')
    // The element, not the class. RIC-14 moved the type styles onto the
    // wrapper (now the package's `richTextClassName`) so the editor and the reader cannot be styled
    // apart, which means a heading is an `<h1>` here rather than a styled div.
    expect(c.querySelector('h1, h2')?.textContent).toBe('Heading')
    expect(c.querySelectorAll('li')).toHaveLength(2)
    expect(c.querySelector('code')?.textContent).toBe('code')
  })

  it('leaves no marker as a literal character', async () => {
    const c = await show('a **bold** word and a # not-heading')
    expect(c.textContent).toContain('bold')
    expect(c.textContent).not.toContain('**')
  })

  it('renders an unknown format as plain text rather than guessing', async () => {
    const body = '{"type":"doc","content":[]}'
    expect((await show(body, 'unknown')).textContent).toContain(body)
  })

  it('does not interpret markup in a description', async () => {
    const c = await show('<b>not bold</b>')
    expect(c.querySelector('b')).toBeNull()
    expect(c.textContent).toContain('<b>not bold</b>')
  })

  it('keeps a nostr pointer out of the prose, as an issue does — RIC-9', async () => {
    // The regression this file is guarding. The project surface rendered the
    // raw bech32 and drew nothing for the object it named, while the issue
    // surface had done both since PRO-7. Both mount `LiveHeader` now, so the
    // asymmetry cannot be reintroduced by editing one call site.
    // RIC-10 draws a mid-sentence pointer in place rather than cutting it out,
    // so the assertion is that the sentence survives and the reader gets a chip
    // rather than a 200-character pointer — not that no pointer text exists.
    const c = await show(`Tracked in ${NADDR} for now.`)
    expect(c.textContent).toContain('Tracked in')
    expect(c.textContent).toContain('for now.')
    await waitFor(() => expect(c.querySelector('[data-reference]')).not.toBeNull())
  })
})

describe('LiveHeader, the placeholder (from ProjectHeader.test.tsx)', () => {
  it('still shows the placeholder when there is no description', () => {
    // Before the editor arrives, and as long as it has not, the reading surface says it.
    expect(render(header('', 'marker', false)).container.textContent).toContain('Add a description…')
  })
})

describe('LiveHeader, a block link (RIC-18)', () => {
  const doc = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', id: 'b2', content: [{ type: 'text', text: 'Linked' }] },
    ],
  })

  /** Opens the page at `#block-b2` and returns, for each scroll to `b2`, the surface it was on. */
  async function opened(run: () => Promise<unknown> | unknown, check: (scrolled: string[]) => Promise<void> | void) {
    window.history.replaceState(null, '', '/p/abc#block-b2')
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      if (this.getAttribute('data-block-id') === 'b2') scrolled.push(this.closest('[data-description]')?.getAttribute('data-description') ?? '')
    }
    try {
      await run()
      await check(scrolled)
    } finally {
      Element.prototype.scrollIntoView = original
      window.history.replaceState(null, '', '/')
    }
  }

  it('scrolls to the block once the editor holds it, not only on the reading surface the editor replaces', async () => {
    // Production, 5 October: the link scrolled the reading surface, the editor's arrival dropped the scroll, and the
    // block was off screen. The scroll has to land on the surface that stays.
    await opened(
      () => write(doc, 'blocks'),
      (scrolled) => waitFor(() => expect(scrolled.at(-1)).toBe('editing')),
    )
  })

  it('scrolls a reader once, on the reading surface, and stops', async () => {
    await opened(
      () => render(header(doc, 'blocks', true)),
      async (scrolled) => {
        await waitFor(() => expect(scrolled).toEqual(['reading']))
        await new Promise((r) => setTimeout(r, 300))
        expect(scrolled).toEqual(['reading'])
      },
    )
  })

  it('scrolls to the block when a block link is followed inside Ship, with the page already open (WBM-11)', async () => {
    window.history.replaceState(null, '', '/p/abc')
    render(header(doc, 'blocks', true))
    await screen.findByText('Linked')
    await opened(
      // A chip in a comment or description routes here without reloading: the router's `navigateTo`.
      () => {
        window.history.pushState(null, '', '/p/abc#block-b2')
        window.dispatchEvent(new PopStateEvent('popstate'))
      },
      (scrolled) => waitFor(() => expect(scrolled).toEqual(['reading'])),
    )
  })

  it('leaves the page alone once the person has scrolled it themselves', async () => {
    await opened(
      async () => {
        // Scrolled before the first tick: the link does nothing, on either surface.
        render(header(doc, 'blocks', false))
        window.dispatchEvent(new Event('wheel'))
        await screen.findByRole('textbox', { name: 'Description' })
        await new Promise((r) => setTimeout(r, 300))
      },
      (scrolled) => expect(scrolled).toEqual([]),
    )
  })
})
