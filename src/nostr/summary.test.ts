/**
 * A summary's seed on the root is one line (SPEC §6.12): whatever wrote it —
 * the New dialogs, another app through Ship's builders — no `summary` tag ever
 * carries a line break, and a blank one writes no tag at all.
 */
import { describe, expect, it } from 'vitest'
import { buildIssue, buildProject } from './events'

const PK = 'ab'.repeat(32)
const FOLDER = '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34'
const summaryTag = (tags: string[][]) => tags.filter((t) => t[0] === 'summary')

describe('the summary tag on a new issue and a new project', () => {
  it('folds line breaks and runs of spaces to one space', () => {
    const issue = buildIssue(PK, 1_000, { issueId: 'i1', title: 'Totals', folder: FOLDER, summary: 'Line one\nline two' })
    const project = buildProject(PK, 1_000, { projectId: 'p1', title: 'Billing', folder: FOLDER, summary: '  Line one\r\n\tline   two ' })
    expect(summaryTag(issue.tags)).toEqual([['summary', 'Line one line two']])
    expect(summaryTag(project.tags)).toEqual([['summary', 'Line one line two']])
    // And a blank one, line breaks included, writes no tag at all.
    expect(summaryTag(buildIssue(PK, 1_000, { issueId: 'i2', title: 'Totals', folder: FOLDER, summary: ' \n ' }).tags)).toEqual([])
    expect(summaryTag(buildProject(PK, 1_000, { projectId: 'p2', title: 'Billing', folder: FOLDER, summary: '' }).tags)).toEqual([])
  })
})
