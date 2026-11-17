/**
 * The issue list's grouping rule, as production has it (`byStatus` in
 * apps/ship/views/issue-list.ts) — the vocabulary's order, empty groups
 * dropped, and a status the vocabulary does not know shown in its own group
 * rather than hidden, because an issue that vanishes from every list is
 * worse than one in an oddly-named column.
 *
 * Generic over anything with a `status`, so a row shape and a fold `Issue`
 * both group the same way. The vocabulary comes from the caller (the seam
 * re-exports `ISSUE_STATUSES`), so this file knows no kinds.
 */
import type { Stage } from '@estiva-app/interop'
export interface StatusEntry {
  value: string
  label: string
  /** What it means; the board puts a status it does not list in the first column of the same stage. */
  stage?: Stage
}

export interface StatusGroup<T> {
  status: string
  label: string
  items: T[]
}

export function groupByStatus<T extends { status: string }>(items: T[], vocabulary: StatusEntry[]): StatusGroup<T>[] {
  const groups: StatusGroup<T>[] = vocabulary.map((entry) => ({
    status: entry.value,
    label: entry.label,
    items: items.filter((item) => item.status === entry.value),
  }))
  const known = new Set(vocabulary.map((entry) => entry.value))
  for (const item of items) {
    if (known.has(item.status)) continue
    const held = groups.find((group) => group.status === item.status)
    if (held) held.items.push(item)
    else groups.push({ status: item.status, label: item.status, items: [item] })
  }
  return groups.filter((group) => group.items.length)
}

/**
 * The board's columns: one per status in the vocabulary's order, every one
 * drawn, empty or not. An issue in a status the vocabulary does not list sits
 * in the first column whose status has its stage, shown there by its id, rather
 * than vanishing from the board (Miky, 30 Oct, EAC-3). One whose stage nothing
 * reads counts as open, as every app counts it, so it sits in the first open
 * column.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-companys-statuses-are-its-own-layer-of-a-types-properties.md
 */
export function boardColumns<T extends { status: string; stage?: Stage }>(items: T[], vocabulary: StatusEntry[]): StatusGroup<T>[] {
  const known = new Set(vocabulary.map((entry) => entry.value))
  const columnOf = (item: T) => {
    if (known.has(item.status)) return item.status
    const stage = item.stage ?? 'open'
    return vocabulary.find((entry) => entry.stage === stage)?.value ?? vocabulary[0]?.value
  }
  return vocabulary.map((entry) => ({ status: entry.value, label: entry.label, items: items.filter((item) => columnOf(item) === entry.value) }))
}

/** The label the vocabulary gives a status, or the raw value when it has none. */
export function statusLabel(status: string, vocabulary: StatusEntry[]): string {
  return vocabulary.find((entry) => entry.value === status)?.label ?? status
}
