/**
 * Ship's relay: a list read is asked in one request, never paged (ISS-9).
 *
 * A list read (SPEC §6.13, `fields: 'newest'`) naming its files by `#d`, with
 * a `limit` of at least as many files, is whole in one answer: the relay's
 * `limit` counts first records there, and each comes with its fields' current
 * changes beside it. `Relay.queryAll` pages it as any other filter instead.
 * Its batched first page cannot settle a list read, because the changes make
 * the answer longer than any page this relay has delivered yet, so each filter
 * was then asked again in a request of its own. Interop asks one such filter
 * per author and kind (`listReadFilters`), so a cold Ship open with issues read
 * by their fields made 55 relay reads where it had made 39 (18 Nov,
 * production): 17 of them were the Folder listing's list reads, asked twice.
 *
 * The rest of a `queryAll` is paged as before, in its own request: the relay
 * refuses one mixing list reads with plain filters.
 */
import { MAX_FILTERS_PER_QUERY, RELAY_PAGE_CEILING, Relay, type QueryAllOptions, type SignedEvent } from '@estiva-app/protocol'

/**
 * Whether one answer holds all of this filter: a list read of one author's files by `#d`, its `limit` covering
 * every file it names. One author, as interop's `listReadOf` asks: two authors may each hold a file under one `d`.
 */
export function isWholeListRead(filter: Record<string, unknown>): boolean {
  if (filter.fields !== 'newest') return false
  if (!Array.isArray(filter.authors) || filter.authors.length !== 1) return false
  const ds = filter['#d']
  if (!Array.isArray(ds) || ds.length === 0 || ds.length > RELAY_PAGE_CEILING) return false
  if (filter.until !== undefined || filter.since !== undefined) return false
  return typeof filter.limit === 'number' && filter.limit >= new Set(ds).size
}

export class ListReadRelay extends Relay {
  override async queryAll(filters: Record<string, unknown>[], options?: QueryAllOptions): Promise<SignedEvent[]> {
    const lists = filters.filter(isWholeListRead)
    if (!lists.length) return super.queryAll(filters, options)
    const rest = filters.filter((filter) => !isWholeListRead(filter))
    const reads: Promise<SignedEvent[]>[] = []
    for (let at = 0; at < lists.length; at += MAX_FILTERS_PER_QUERY) reads.push(this.query(lists.slice(at, at + MAX_FILTERS_PER_QUERY)))
    if (rest.length) reads.push(super.queryAll(rest, options))
    const seen = new Set<string>()
    return (await Promise.all(reads)).flat().filter((event) => !seen.has(event.id) && !!seen.add(event.id))
  }
}
