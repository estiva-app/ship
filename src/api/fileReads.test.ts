import { describe, expect, it } from 'vitest'
import { relayFileReadsOf } from '@estiva-app/protocol'
import { projectFieldsOf } from './fileReads'

/* ALO-5: what the relay's NIP-11 switches on in Ship, read as production announces it. */
const PRODUCTION = { files: { requires_prev: ['osnova.project'] }, file_list: { newest: true, text: true }, file_search: { max_page_size: 20, types: ['osnova.project'] } }

describe("the relay's announcement", () => {
  it('a relay that finds projects by their words has `[` search them by their fields', () => {
    expect(projectFieldsOf(relayFileReadsOf(PRODUCTION), false)).toEqual({ text: true, search: true })
  })

  it('a relay that keeps projects in order but does not find them by their words leaves `[` on titles', () => {
    expect(projectFieldsOf(relayFileReadsOf({ ...PRODUCTION, file_search: { types: ['osnova.issue'] } }), false)).toEqual({ text: true })
  })

  it('a relay that has not made the switch turns nothing on, even if it searches projects', () => {
    expect(projectFieldsOf(relayFileReadsOf({ file_search: PRODUCTION.file_search }), false)).toBeUndefined()
  })
})
