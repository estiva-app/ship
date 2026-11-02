import type { Reaction, Resolution } from '@/api'
import type { ActivityItem } from '@/components/Activity'
import type { ThreadData } from '@/components/ConversationThread'
import { ACTIVITY_ITEMS, ANA, MARA, RAVI, THREADS } from '@/fixtures/issues'
import { ISSUE_POINTER, LOG, ME, SHOT } from '@/fixtures/fakeRelay'

/**
 * What the conversation stories show: production's fixture threads, plus
 * everything a message can carry — a picture, a file, a linked issue, an edit,
 * bold text — and reactions from other people and from you.
 */
const now = Math.floor(Date.now() / 1000)

export const STORY_THREADS: ThreadData[] = [
  { ...THREADS[0], root: { ...THREADS[0].root, files: [SHOT] } },
  THREADS[1],
  {
    id: 't3',
    root: { id: 'm5', author: MARA, by: 'mara', at: now - 86400 * 2, body: `The **fold** runs twice on a re-linked project. Trace attached, and the issue:\n\n${ISSUE_POINTER}`, files: [LOG], editedAt: now - 86400 },
    replies: [{ id: 'm6', author: RAVI, by: 'ravi', at: now - 86400 * 2 + 1800, body: 'Looking at it now.' }],
  },
]

/** "Mentioned in" as Ship's pages make it: every row a mention (PEE-26), with the place Ship found for it. */
export const STORY_MENTIONS: ActivityItem[] = [
  { ...ACTIVITY_ITEMS[0], relation: 'mention', whereKind: 'issue' },
  { ...ACTIVITY_ITEMS[1], whereKind: 'project' },
]

export const STORY_PEOPLE: Record<string, string> = { ravi: 'Ravi Mehta', mara: 'Mara Sato', ana: 'Ana Duarte' }

/** One of them yours, so both looks of a reaction show. */
export const STORY_REACTIONS: Record<string, Reaction[]> = {
  m1: [{ emoji: '👍', count: 3, by: ['ravi', 'mara', ME], mine: 'r-seed' }],
  m2: [{ emoji: '🚀', count: 1, by: ['ana'] }],
  m5: [{ emoji: '🙏', count: 1, by: ['ravi'] }],
}

export const STORY_ME = ANA

/** The first thread's comment, resolved in Peek: Ship shows who, the note and when, and offers no Resolve (Katerina, 2 November). */
export const STORY_RESOLVED: Record<string, Resolution> = {
  m1: { id: 'res-1', action: 'resolved', by: 'mara', at: now - 3600, message: 'Keeping the vocabulary order; the fix is in 0.37.' },
}

/** A comment that was deleted: its replies stay under it, and no new reply can be written (PER-24, as Peek draws it). */
export const STORY_DELETED: ThreadData = {
  id: 'gone',
  rootMissing: true,
  root: { id: 'm7', author: RAVI, by: 'ravi', at: now - 7200, body: 'Was this the column order bug?' },
  replies: [{ id: 'm8', author: MARA, by: 'mara', at: now - 3600, body: 'Yes, fixed in 0.37.' }],
}

/** A comment written on words in Leaf: the words it quotes, under the name. */
export const STORY_QUOTED: ThreadData = {
  id: 'm9',
  root: { id: 'm9', author: MARA, by: 'mara', at: now - 1800, body: 'Should this say Folder, with a capital?', quote: { start: 'moves the project to another', end: 'folder' } },
  replies: [],
}

/** A new comment naming you urgently: the amber mark until it is read. */
export const STORY_URGENT: ThreadData = {
  id: 'm10',
  root: { id: 'm10', author: RAVI, by: 'ravi', at: now - 600, body: 'Can you check the archived board today?', urgent: [ME] },
  replies: [],
}
