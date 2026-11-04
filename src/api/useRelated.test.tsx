import { describe, expect, it } from 'vitest'
import type { ForeignObject, TopicOfFile } from './foreign'
import { withoutTopics } from './useRelated'

const placed = (address: string, title: string) => ({ ref: address, address, kind: 30840, slots: { title: { value: title } } }) as unknown as ForeignObject
const chip = (address: string, title: string): TopicOfFile => ({ address, folder: 'team', title, archived: false })

const LAUNCH = '30840:a:launch'
const NOTES = '30840:a:notes'
const DOC = '30023:a:spec'

describe('a project’s Related beside its Topics (SHIPS-2)', () => {
  it('leaves out a topic placed under the project that also lists it, so it shows once, as its chip', () => {
    const related = { all: [placed(LAUNCH, 'Launch'), placed(NOTES, 'Notes')], files: [placed(LAUNCH, 'Launch'), placed(NOTES, 'Notes')], inside: {}, counts: {} }
    const shown = withoutTopics(related, [chip(LAUNCH, 'Launch')])
    expect(typeof shown === 'object' && shown.files.map((f) => f.address)).toEqual([NOTES])
    // `[` still offers it.
    expect(typeof shown === 'object' && shown.all?.map((f) => f.address)).toEqual([LAUNCH, NOTES])
  })

  it('holds every topic back while the file’s topics are still being read, so none flashes and then moves to the chips', () => {
    const related = { files: [placed(LAUNCH, 'Launch'), placed(DOC, 'Spec')], inside: {}, counts: {} }
    const shown = withoutTopics(related, undefined)
    expect(typeof shown === 'object' && shown.files.map((f) => f.address)).toEqual([DOC])
  })

  it('shows a topic that is related but not one of the file’s own topics once they are known', () => {
    const related = { files: [placed(LAUNCH, 'Launch'), placed(NOTES, 'Notes')], inside: {}, counts: {} }
    expect(withoutTopics(related, [])).toBe(related)
    const shown = withoutTopics(related, [chip(LAUNCH, 'Launch')])
    expect(typeof shown === 'object' && shown.files.map((f) => f.address)).toEqual([NOTES])
  })

  it('keeps every placed file when the topics could not be read', () => {
    const related = { files: [placed(LAUNCH, 'Launch')], inside: {}, counts: {} }
    expect(withoutTopics(related, 'failed')).toBe(related)
  })
})
