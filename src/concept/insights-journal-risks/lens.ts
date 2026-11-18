/**
 * CONCEPT — Initiatives as lenses (Miky, 18 Nov): today's Topics, renamed. An Initiative lists projects, as a topic
 * lists files, and shows every Insight, Journal entry and Risk about them, and about itself; nothing is filed in it.
 * So one item shows in every Initiative that lists its project. The first Initiative is real; the second is imagined,
 * to show the same project, and its items, in two.
 *
 * Also items filed elsewhere in the team, so the team's lists show where each lives: another project, an issue in it,
 * an Initiative itself, or the team's own. Real moments from 16–18 Nov.
 */
import { CLAUDE, MIKY, PROJECT, TEAM, type Item } from './fixtures'

export type Initiative = { id: string; title: string; projects: string[] }

const IJR = 'Insights, Journal and Risks'
export const INITIATIVES: Initiative[] = [
  { id: 'ini1', title: 'Re-architecting Osnova protocol', projects: [PROJECT, IJR, 'Activity indicator'] },
  { id: 'ini2', title: 'Ship and Leaf catch up with Peek', projects: [PROJECT] },
]

/** The project an item rolls up to: its own, or its issue's (an issue's project, else this prototype's project). */
export const projectOf = (i: Item) => (i.about?.kind === 'project' ? i.about.title : i.about?.kind === 'issue' ? (i.about.project ?? PROJECT) : undefined)

/** Every Initiative that shows an item: the one it is about, or each that lists its project. */
export const initiativesOf = (i: Item) =>
  INITIATIVES.filter((n) => (i.about?.kind === 'initiative' ? i.about.title === n.title : n.projects.includes(projectOf(i) ?? '')))

export const ELSEWHERE: Item[] = [
  {
    id: 'e1', type: 'insight', word: 'Insight', category: 'Product', status: 'accepted', at: '18 Nov', day: '2026-11-18', team: TEAM, about: { kind: 'project', title: IJR }, acceptedBy: MIKY,
    title: 'A list read row by row beats a dashboard',
    summary: 'Miky found Linear’s one-line rows by milestone clearer than three tables, and the Table view then said nothing new.',
    markedBy: CLAUDE,
  },
  {
    id: 'e2', type: 'journal', word: 'Decision', status: 'accepted', at: '18 Nov', day: '2026-11-18', team: TEAM, about: { kind: 'initiative', title: 'Re-architecting Osnova protocol' }, acceptedBy: MIKY, decidedBy: MIKY, isNew: true,
    title: 'An Initiative is a lens: it shows what is about the projects it lists',
    summary: 'Nothing is filed in an Initiative; an item about a project shows in every Initiative that lists it.',
    markedBy: MIKY,
  },
  {
    id: 'e3', type: 'risk', word: 'Concern', severity: 'Medium', status: 'open', at: '18 Nov', day: '2026-11-18', team: TEAM, acceptedBy: MIKY, isNew: true,
    title: 'Peek says Topics where Ship says Initiatives',
    summary: 'Until every app uses one name, the same list has two.',
    markedBy: CLAUDE,
  },
  {
    id: 'e4', type: 'risk', word: 'Question', severity: 'Low', status: 'open', at: '18 Nov', day: '2026-11-18', team: TEAM, about: { kind: 'issue', title: 'Scope to decide on the Issues list', project: IJR }, acceptedBy: MIKY,
    title: 'Does ✕ on a line to decide mean Not doing, or “let me choose”?',
    markedBy: CLAUDE,
  },
  {
    id: 'e5', type: 'journal', word: 'Update', status: 'accepted', at: '16 Nov', day: '2026-11-16', team: TEAM, about: { kind: 'project', title: 'Activity indicator' }, acceptedBy: MIKY,
    title: 'Peek’s Activity indicator is done',
    summary: 'What names you lights its topic: blue for a mention or a reply, orange for a reaction.',
    markedBy: MIKY,
  },
]
