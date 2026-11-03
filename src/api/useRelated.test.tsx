import { describe, expect, it } from 'vitest'
import type { ForeignObject, TopicOfFile } from './foreign'
import { withoutTopics } from './useRelated'

const placed = (address: string, title: string) => ({ ref: address, address, kind: 30840, slots: { title: { value: title } } }) as unknown as ForeignObject
const chip = (address: string, title: string): TopicOfFile => ({ address, folder: 'team', title, archived: false })

const LAUNCH = '30840:a:launch'
const NOTES = '30840:a:notes'

describe('a project’s Related beside its Topics (SHIPS-2)', () => {
  it('leaves out a topic placed under the project that also lists it, so it shows once, as its chip', () => {
    const related = { all: [placed(LAUNCH, 'Launch'), placed(NOTES, 'Notes')], files: [placed(LAUNCH, 'Launch'), placed(NOTES, 'Notes')], inside: {}, counts: {} }
    const shown = withoutTopics(related, [chip(LAUNCH, 'Launch')])
    expect(typeof shown === 'object' && shown.files.map((f) => f.address)).toEqual([NOTES])
    // `[` still offers it.
    expect(typeof shown === 'object' && shown.all?.map((f) => f.address)).toEqual([LAUNCH, NOTES])
  })

  it('keeps every placed file while the topics are still being read', () => {
    const related = { files: [placed(LAUNCH, 'Launch')], inside: {}, counts: {} }
    expect(withoutTopics(related, undefined)).toBe(related)
  })
})
