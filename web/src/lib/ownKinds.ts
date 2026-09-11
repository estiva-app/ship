import type { ForeignObject } from '@estiva-app/interop'
import { KIND } from '../../../src/kinds'

/**
 * Which files Ship's navigation lists, and which it shows as Related —
 * RFC 0.5 §10.7, decided 2026-09-11: **navigation is by kind; nesting is by
 * intent.**
 *
 * Ship is a specialized app. Its tree lists folders and, inside them, its own
 * kinds — projects and issues — and nothing else, because a specialized app's
 * navigation is its own files and the generic apps (Peek, Leaf) are where every
 * file in a Folder is listed. But a foreign file somebody deliberately placed
 * *under* a project or an issue was a person saying "this belongs here", and
 * Ship may not ignore it: it appears on that file's page as Related, whatever
 * its kind.
 *
 * Both halves come from one set, defined once. Everything that is not here is
 * "not mine" — there is deliberately no list of the kinds Ship expects to meet,
 * so a Leaf document arrives the day Leaf does, and so does a kind nobody here
 * has heard of.
 */
export const OWN_KINDS: ReadonlySet<number> = new Set([KIND.PROJECT, KIND.ISSUE])

export function isOwnKind(kind: number): boolean {
  return OWN_KINDS.has(kind)
}

/**
 * A Folder's files, split into what the tree lists and what it only counts.
 *
 * `foreign` is kept rather than dropped because its *count* is part of the
 * view: a Folder holding four topics and no projects is not empty, and a blank
 * list would say it was. Order is the Folder's, preserved on both sides.
 */
export function splitByKind(files: readonly ForeignObject[]): { own: ForeignObject[]; foreign: ForeignObject[] } {
  const own: ForeignObject[] = []
  const foreign: ForeignObject[] = []
  for (const file of files) (isOwnKind(file.kind) ? own : foreign).push(file)
  return { own, foreign }
}

/**
 * The foreign files placed under one of Ship's objects — its Related section.
 *
 * `parentRef` is the runtime's answer to "what does this file name as its
 * parent": for a bare file its own `a` tag, for any other kind the tag its
 * owner's manifest declares. Ship compares it to the object's address and asks
 * nothing else — the filter is "not mine, and under this", one level, with no
 * recursion. Depth is the consumer's budget and interop's `MAX_LIST_DEPTH` is
 * 1 on purpose; a sub-topic under a related topic is that topic's business.
 *
 * Ship's own children are not here: an issue whose `parentRef` is the project
 * is the Issues table's, and listing it twice would put the same file on one
 * page under two headings.
 */
export function relatedTo(files: readonly ForeignObject[], address: string): ForeignObject[] {
  return files.filter((file) => file.parentRef === address && !isOwnKind(file.kind))
}
