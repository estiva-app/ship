import type { IssueRowData } from '@/components/IssueRow'
import type { IssuesTableRow } from '@/components/IssuesTable'
import type { ThreadData } from '@/components/ConversationThread'
import anaPortrait from './avatars/ana-duarte.png'
import raviPortrait from './avatars/ravi-mehta.png'
import maraPortrait from './avatars/mara-sato.png'

/**
 * Invented data for stories and tests — nothing real. Ship's own fictional
 * personas (Ana, Ravi — from scripts/verify.ts) and made-up projects.
 * Statuses are production's vocabulary; one is deliberately unknown.
 */
const NOW = Math.floor(Date.now() / 1000)

/** Portraits: Peek's own fictional demo faces (peek/src/assets/avatars), so the two apps share invented people. */
export const ANA = { name: 'Ana Duarte', picture: anaPortrait }
export const RAVI = { name: 'Ravi Mehta', picture: raviPortrait }
export const MARA = { name: 'Mara Sato', picture: maraPortrait }
export const NOBODY = {}

export const ISSUE_STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const ISSUES: IssuesTableRow[] = [
  { addr: '30851:a:1', id: '1', ref: 'REL-1', title: 'Board columns lose order after an archived project returns', description: 'After an archived project is restored, the board draws its columns in the order the folder union returned them rather than the vocabulary order.', status: 'in_progress', assignee: ANA, openedBy: RAVI, at: NOW - 3600 * 2, conversations: 2 },
  { addr: '30851:a:2', id: '2', ref: 'REL-2', title: 'Comments lose their draft when navigating away', status: 'in_progress', assignee: RAVI, openedBy: ANA, at: NOW - 86400 },
  { addr: '30851:a:3', id: '3', ref: 'REL-3', title: 'Pick the dark theme accent', description: 'Two candidates on the Design Tokens page; the bluer one reads better on the inset surface.', status: 'todo', assignee: MARA, openedBy: ANA, at: NOW - 86400 * 2, conversations: 1 },
  { addr: '30851:a:4', id: '4', ref: 'REL-4', title: 'Add a keyboard path for changing status from the list', status: 'todo', assignee: ANA, openedBy: RAVI, at: NOW - 86400 * 3 },
  { addr: '30851:a:5', id: '5', title: 'Filed from another app, with no ref', status: 'todo', openedBy: NOBODY, at: NOW - 86400 * 4 },
  { addr: '30851:a:6', id: '6', ref: 'REL-6', title: 'Empty states read as broken screens', description: 'A list with nothing in it should say so, in the same voice as the rest of the app — long enough to wrap onto a third line and be clamped at two.', status: 'done', assignee: RAVI, openedBy: ANA, at: NOW - 86400 * 9 },
  { addr: '30851:a:7', id: '7', ref: 'REL-7', title: 'Relay refuses events from a clock ten minutes out', status: 'done', assignee: ANA, openedBy: ANA, at: NOW - 86400 * 12 },
  { addr: '30851:a:8', id: '8', ref: 'REL-8', title: 'Duplicate project cards after a re-seed', status: 'cancelled', openedBy: RAVI, at: NOW - 86400 * 20 },
  { addr: '30851:a:9', id: '9', ref: 'REL-9', title: 'A status Ship has no word for', status: 'blocked', assignee: RAVI, openedBy: ANA, at: NOW - 3600 * 5 },
]

export const ROWS: IssueRowData[] = ISSUES

export const hrefFor = (issue: IssueRowData) => `#/issue/${encodeURIComponent(issue.addr)}`

export const THREADS: ThreadData[] = [
  {
    id: 't1',
    root: { id: 'm1', author: ANA, at: NOW - 3600 * 3, body: 'The board keeps the columns in vocabulary order after a reload, but not after an archived project comes back. Anyone else seeing this?' },
    replies: [
      { id: 'm2', author: RAVI, at: NOW - 3600 * 2, body: 'Yes — it re-reads the folder union and the archived one lands last.' },
      { id: 'm3', author: MARA, at: NOW - 3600, body: 'Same here, from Peek.' },
    ],
  },
  {
    id: 't2',
    root: { id: 'm4', author: RAVI, at: NOW - 86400, body: 'Moving this to in progress.\nWill pair with Ana on the fix tomorrow.' },
    replies: [],
  },
]
