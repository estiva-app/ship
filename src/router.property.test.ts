/**
 * A page address Ship writes reads back as the page it was written for (TES-4).
 *
 * Ship writes an issue's, a project's and a topic's address as
 * `/<word>/<slug>-<d>`, a team's pages under `/app/teams/<id>/…`, and serves
 * any other app's file at its own word (`elsewhere`, record
 * a-files-path-is-the-same-on-every-apps-host). Each must parse back to the same
 * page whatever the title holds, and the links Peek and Leaf write for a file
 * must open that file here.
 *
 * Runs 1,000 inputs a rule on a fixed seed; a failure prints the smallest input
 * and the seed: `FC_SEED=<seed> npx vitest run src/router.property`.
 */
import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { runSettings } from '@estiva-app/protocol/testing'
import { objectRef } from '@estiva-app/interop'
import { isFileId } from '@estiva-app/protocol'
import { HOME, href, parse, PROJECTS_TABS, type Route } from './router'

const settings = runSettings(1000)

/** A title as a person types one: any script, emoji, punctuation, a uuid of its own. */
const titleArb = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 80 }),
  fc.string({ unit: fc.constantFrom('-', ' ', ':', '/', '#', '?', '%', '&', '=', 'a', 'f', '0', 'É', '中', '🙂'), maxLength: 60 }),
  fc.tuple(fc.string({ maxLength: 10 }), fc.uuid()).map(([a, u]) => `${a} ${u}`),
)
const slugArb = fc.option(titleArb, { nil: undefined })
/** A file's id: a random (version 4) lowercase uuid, the only one a file can have (LIN-1). */
const dArb = fc.uuid({ version: 4 })
const folderArb = fc.option(fc.uuid(), { nil: undefined })

/** Each route Ship writes, with what parsing its address must give back: the slug is decoration and is dropped. */
const routeArb: fc.Arbitrary<[Route, Route]> = fc.oneof(
  fc.tuple(dArb, slugArb).map(([d, slug]): [Route, Route] => [{ name: 'issue', d, slug }, { name: 'issue', d }]),
  fc.tuple(dArb, slugArb).map(([d, slug]): [Route, Route] => [{ name: 'topic', d, slug }, { name: 'topic', d }]),
  fc
    .tuple(dArb, slugArb, fc.constantFrom('table', 'board' as const), fc.constantFrom(undefined, 'overview', 'issues' as const))
    .map(([d, slug, view, tab]): [Route, Route] => {
      // The board is on the Issues tab, so a link that asks for it opens that tab (Katerina, 30 September).
      const opens = view === 'board' ? 'issues' : (tab ?? 'overview')
      return [
        { name: 'project', d, slug, view, ...(tab ? { tab } : {}) },
        opens === 'overview' ? { name: 'project', d, view } : { name: 'project', d, view, tab: opens },
      ]
    }),
  fc.uuid().map((id): [Route, Route] => [{ name: 'folder', id }, { name: 'folder', id }]),
  folderArb.map((folder): [Route, Route] => [{ name: 'topics', ...(folder ? { folder } : {}) }, { name: 'topics', ...(folder ? { folder } : {}) }]),
  folderArb.map((folder): [Route, Route] => [{ name: 'issues', ...(folder ? { folder } : {}) }, { name: 'issues', ...(folder ? { folder } : {}) }]),
  fc.tuple(folderArb, fc.constantFrom(...PROJECTS_TABS)).map(([folder, tab]): [Route, Route] => [
    { name: 'projects', tab, ...(folder ? { folder } : {}) },
    // Active is what a bare link opens, so it is written as one.
    { name: 'projects', ...(tab === 'active' ? {} : { tab }), ...(folder ? { folder } : {}) },
  ]),
)

describe("Ship's page addresses", () => {
  test('every page Ship writes an address for opens again from that address, whatever its title', () => {
    fc.assert(
      fc.property(routeArb, ([route, expected]) => {
        const path = href(route)
        expect(parse(path), path).toEqual(expected)
        // The same address with Ship's old `#/` prefix, as links from before SHI-16 carry it.
        expect(parse(`/#${path}`), path).toEqual(expected)
      }),
      settings,
    )
  })

  test("another app's file, served at its own word, keeps its ref through Ship's address", () => {
    fc.assert(
      fc.property(fc.constantFrom('document', 'note', 'deal', 'page-2'), dArb, titleArb, (word, d, title) => {
        const ref = objectRef(d, title)
        const route: Route = { name: 'elsewhere', word, ref }
        expect(parse(href(route))).toEqual(route)
      }),
      settings,
    )
  })

  test('a link Peek or Leaf writes for a file opens that file in Ship', () => {
    fc.assert(
      fc.property(dArb, titleArb, (d, title) => {
        const ref = objectRef(d, title)
        // Peek's topic page and Leaf's document page (each app's `urls` shape).
        expect(parse(`/topic/${ref}`)).toEqual({ name: 'topic', d })
        expect(parse(`/document/${ref}`)).toEqual({ name: 'elsewhere', word: 'document', ref })
        // Ship's own issue address on any host reads the same: only the path is read.
        expect(parse(`/issue/${ref}#block-p1`)).toEqual({ name: 'issue', d })
      }),
      settings,
    )
  })

  test('an id no file can have gets no file path, and never one that reads back as another file (LIN-4)', () => {
    // Made-up ids: any text, a uuid in capitals or of another version, and an id with a colon or a uuid at its tail —
    // which the old reader took for that uuid's file.
    const oddArb = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.uuid().map((u) => u.toUpperCase()),
      fc.uuid({ version: 1 }),
      fc.tuple(fc.string({ maxLength: 10 }), fc.uuid({ version: 4 })).map(([a, u]) => `${a}:${u}`),
      fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.uuid({ version: 4 })).map(([a, u]) => `${a}-${u}`),
    )
    fc.assert(
      fc.property(oddArb.filter((d) => !isFileId(d)), slugArb, fc.constantFrom('issue', 'project', 'topic' as const), (d, slug, name) => {
        const route: Route = name === 'project' ? { name, d, slug, view: 'table' } : { name, d, slug }
        expect(parse(href(route))).toEqual(HOME)
      }),
      settings,
    )
  })

  test('a pasted file path whose id is not a file id opens no file (LIN-4)', () => {
    fc.assert(
      fc.property(fc.constantFrom('issue', 'project', 'topic'), fc.uuid({ version: 4 }), (word, u) => {
        // A uuid in capitals is read lowercased; one of another version names no file.
        expect(parse(`/${word}/${u.toUpperCase()}`)).toMatchObject({ name: word, d: u })
        expect(parse(`/${word}/${u.slice(0, 14)}1${u.slice(15)}`)).toEqual(HOME)
      }),
      settings,
    )
  })

  test('any pasted path is read without throwing', () => {
    const pathArb = fc.oneof(
      fc.string({ unit: 'grapheme', maxLength: 60 }).map((s) => `/${s}`),
      fc
        .tuple(fc.constantFrom('issue', 'project', 'topic', 'document', 'app/teams', 'folder', 'o', 'x'), fc.string({ unit: fc.constantFrom('%', '2', 'F', 'a', '-', '/', '?', '#', '='), maxLength: 20 }))
        .map(([word, rest]) => `/${word}/${rest}`),
    )
    fc.assert(
      fc.property(pathArb, (path) => {
        expect(() => parse(path), path).not.toThrow()
      }),
      settings,
    )
  })
})
