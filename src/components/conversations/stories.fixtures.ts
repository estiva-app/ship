import type { Reaction } from '@/api'
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
