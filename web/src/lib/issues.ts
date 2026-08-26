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
export interface StatusEntry {
  value: string
  label: string
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

/** The label the vocabulary gives a status, or the raw value when it has none. */
export function statusLabel(status: string, vocabulary: StatusEntry[]): string {
  return vocabulary.find((entry) => entry.value === status)?.label ?? status
}
