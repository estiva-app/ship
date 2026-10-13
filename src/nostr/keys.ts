/**
 * Project keys, and the refs numbered from them — SHI-4, SPEC §6.1.
 *
 * A ref used to be `refPrefix(project title)` plus a count of that project's
 * own issues, so two projects whose titles share three letters numbered the
 * same refs independently: on 13 Oct 2026, 66 refs were carried by more than
 * one issue, and every command that takes a ref refused them.
 *
 * Now every project has a **key** of 3–6 letters that no other project the
 * writer can see holds (Miky, 2026-10-13), and a ref is `KEY-n` where `n` is
 * one past the highest number any visible issue carries under that key — in
 * any project, so an issue that moved away still holds its number.
 *
 * Where a project's key comes from, in order:
 *
 * 1. Its folded `key` field — the root's `key` tag, overridden by a
 *    `kind:1851` on `key`. Set when the project is made, or pinned by
 *    `pinKey` the first time Ship numbers an issue in it.
 * 2. For a project made before keys, or by an app that set none: the prefix
 *    most of its own issues carry, if it holds more refs under that prefix
 *    than any other keyless project does (Miky, 2026-10-13: "most refs keeps
 *    it"). Ties go to the older project.
 * 3. Otherwise the shortest free key from its title (`suggestKey`).
 *
 * Archived projects take part in none of this — they mint nothing — but the
 * prefixes their issues carry still count as taken.
 *
 * Every step is a pure function of what the reader can see, so two Ship tabs
 * derive the same key and the same next number without talking. They can still
 * race — two people filing at the same moment, or a private Folder holding a
 * key nobody else can see — and `clashes` is the rule for that: the later
 * claim gives way, and only its own author moves it.
 */
import type { Issue, Project } from './fold'

/** A key as SPEC §6.1 defines one. Anything else on the wire is shown, never minted from. */
export const KEY_PATTERN = /^[A-Z]{3,6}$/

/** The key part of a ref: "PEE-12" → "PEE". */
export function keyOfRef(ref: string | undefined): string | undefined {
  const match = ref?.match(/^(.+)-\d+$/)
  return match?.[1]
}

/** The A–Z letters of a title, accents folded: "Peek: Real-time" → "PEEKREALTIME". */
function lettersOf(title: string): string {
  return title
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * The shortest key of 3–6 letters from `title` that `taken` does not hold.
 *
 * Tried in order: the title's first 3, 4, 5, 6 letters; the first letter of
 * each word; then the first two letters followed by each later letter, and the
 * first five followed by A–Z. A title with fewer than three letters is padded
 * with X. Never returns a taken key unless all of those are taken, which no
 * workspace of this size reaches.
 */
export function suggestKey(title: string, taken: ReadonlySet<string>): string {
  const letters = lettersOf(title).padEnd(3, 'X')
  const words = title
    .normalize('NFD')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean)
  const candidates: string[] = []
  for (let n = 3; n <= 6; n++) candidates.push(letters.slice(0, n))
  const initials = words.map((word) => word[0]).join('')
  if (initials.length >= 3) candidates.push(initials.slice(0, 6))
  for (const later of letters.slice(2)) candidates.push(letters.slice(0, 2) + later)
  for (const later of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') candidates.push(letters.slice(0, 5) + later)
  return candidates.find((key) => KEY_PATTERN.test(key) && !taken.has(key)) ?? candidates[0]
}

/**
 * The folded `key` field, when it is a key at all. Another client may have
 * written anything there; SPEC §6.1 says a reader shows such a value but does
 * not number from it, so the project counts as keyless here.
 */
export function explicitKey(project: Pick<Project, 'key'>): string | undefined {
  const value = project.key?.trim()
  return value && KEY_PATTERN.test(value) ? value : undefined
}

/**
 * Every visible project's key, by address. Archived projects without a key of
 * their own are left out: they mint nothing.
 */
export function projectKeys(projects: readonly Project[], issues: readonly Issue[]): Map<string, string> {
  const keys = new Map<string, string>()
  const taken = new Set<string>()
  for (const project of projects) {
    const key = explicitKey(project)
    if (key) {
      keys.set(project.addr, key)
      taken.add(key)
    }
  }

  // Refs under each prefix, per project, and every prefix in use anywhere.
  const held = new Map<string, Map<string, number>>()
  const inUse = new Set<string>()
  for (const issue of issues) {
    const prefix = keyOfRef(issue.ref)
    if (!prefix) continue
    inUse.add(prefix)
    if (!issue.projectAddr) continue
    const byPrefix = held.get(issue.projectAddr) ?? new Map<string, number>()
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1)
    held.set(issue.projectAddr, byPrefix)
  }

  const keyless = projects
    .filter((project) => !keys.has(project.addr) && !project.archived)
    .sort((a, b) => a.createdAt - b.createdAt || (a.addr < b.addr ? -1 : 1))

  // Step 2: a prefix goes to the keyless project holding the most refs under
  // it. Greedy over every (project, prefix) pair, most refs first, so a
  // project holding the most under two prefixes takes one and the runner-up
  // for the other still gets it. Ties go to the older project (`keyless` order).
  const order = new Map(keyless.map((project, i) => [project.addr, i]))
  const pairs = keyless.flatMap((project) =>
    [...(held.get(project.addr) ?? [])]
      .filter(([prefix]) => KEY_PATTERN.test(prefix))
      .map(([prefix, count]) => ({ addr: project.addr, prefix, count })),
  )
  pairs.sort((a, b) => b.count - a.count || order.get(a.addr)! - order.get(b.addr)! || (a.prefix < b.prefix ? -1 : 1))
  for (const { addr, prefix } of pairs) {
    if (keys.has(addr) || taken.has(prefix)) continue
    keys.set(addr, prefix)
    taken.add(prefix)
  }

  // Step 3: the rest take the shortest free key from their title.
  const unavailable = new Set([...taken, ...inUse])
  for (const project of keyless) {
    if (keys.has(project.addr)) continue
    const key = suggestKey(project.title, unavailable)
    keys.set(project.addr, key)
    unavailable.add(key)
  }
  return keys
}

/** Keys a new project may not take: every visible project's key, and every prefix a ref carries. */
export function takenKeys(
  projects: readonly Project[],
  issues: readonly Issue[],
  keys: ReadonlyMap<string, string> = projectKeys(projects, issues),
): Set<string> {
  const taken = new Set(keys.values())
  for (const issue of issues) {
    const prefix = keyOfRef(issue.ref)
    if (prefix) taken.add(prefix)
  }
  return taken
}

/** Why `key` cannot be a new project's key, or undefined when it can. */
export function keyProblem(
  key: string,
  projects: readonly Project[],
  issues: readonly Issue[],
  keys: ReadonlyMap<string, string> = projectKeys(projects, issues),
): string | undefined {
  if (!KEY_PATTERN.test(key)) return 'A key is 3–6 letters, A to Z.'
  const holder = projects.find((project) => keys.get(project.addr) === key)
  if (holder) return `${key} is used by ${holder.title}.`
  if (issues.some((issue) => keyOfRef(issue.ref) === key)) return `${key} is already used by older issues.`
  return undefined
}

/** `KEY-n`, one past the highest number any visible issue carries under `key`. */
export function nextRef(key: string, existingRefs: readonly (string | undefined)[]): string {
  const used = existingRefs
    .filter((ref): ref is string => !!ref && keyOfRef(ref) === key)
    .map((ref) => Number.parseInt(ref.slice(key.length + 1), 10))
    .filter((n) => Number.isFinite(n))
  return `${key}-${used.length ? Math.max(...used) + 1 : 1}`
}

/** When a claim was made: the change that set the value, or the root's own time. */
function claimedAt(object: { createdAt: number; fields: Record<string, { at: number } | undefined> }, field: string): number {
  return object.fields[field]?.at ?? object.createdAt
}

/**
 * The later of each set of objects claiming the same value of `field`, among
 * the claims this client just made — the ones it must move (SPEC §6.1).
 *
 * Earlier `created_at` keeps the value; on a tie the lower address keeps it.
 * Only the client that made the later claim moves it, after publishing and
 * reading back, so N readers of one clash publish one change between them, not
 * N — and a duplicate from before keys (Miky: "old duplicates stay") is never
 * anybody's to move.
 */
export function clashes<T extends { addr: string; createdAt: number; fields: Record<string, { at: number } | undefined> }>(
  objects: readonly T[],
  valueOf: (object: T) => string | undefined,
  field: string,
  claimedHere: ReadonlySet<string>,
): T[] {
  const byValue = new Map<string, T[]>()
  for (const object of objects) {
    const value = valueOf(object)
    if (!value) continue
    byValue.set(value, [...(byValue.get(value) ?? []), object])
  }
  const losers: T[] = []
  for (const group of byValue.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort((a, b) => claimedAt(a, field) - claimedAt(b, field) || (a.addr < b.addr ? -1 : 1))
    for (const later of ordered.slice(1)) if (claimedHere.has(later.addr)) losers.push(later)
  }
  return losers
}
