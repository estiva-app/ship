import { describe, expect, it } from 'vitest'
import { archivesOf, ownArchive } from './archive'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const PROJECT = '30850:x:hive'
const OTHER_PROJECT = '30850:x:orchard'
const ISSUE = '30851:x:spring'
const LONE = '30851:x:lone'

type Fields = Record<string, { value: string; by: string; at: number }>
const field = (value: string, by = A, at = 10) => ({ value, by, at })
const change = (target: string, value: string, note = '') => ({ target, field: 'archived', value, note })

describe('ownArchive — the winning change, and its note as the resolution (FOL-46)', () => {
  it('reads the winner off the fold and the note off the last change to the field', () => {
    const file = { addr: PROJECT, fields: { archived: field('true', B, 20) } }
    const activity = [change(PROJECT, 'true', 'first'), change(PROJECT, '', ''), change(PROJECT, 'true', 'Moved to the orchard.')]
    expect(ownArchive(file, activity)).toEqual({ by: B, at: 20, resolution: 'Moved to the orchard.' })
  })

  it('is nothing once an empty value restored it', () => {
    expect(ownArchive({ addr: PROJECT, fields: { archived: field('') } }, [change(PROJECT, 'true'), change(PROJECT, '')])).toBeUndefined()
    expect(ownArchive({ addr: PROJECT, fields: {} }, [])).toBeUndefined()
  })

  it('does not read Ship’s old placeholder note, or an empty one, as a resolution', () => {
    const file = { addr: PROJECT, fields: { archived: field('true') } }
    expect(ownArchive(file, [change(PROJECT, 'true', 'archived')])).toEqual({ by: A, at: 10 })
    expect(ownArchive(file, [change(PROJECT, 'true', '  ')])).toEqual({ by: A, at: 10 })
  })
})

describe('archivesOf — the cascade is read, never written', () => {
  const project = (addr: string, archived = false, contentFolder = 'own') => ({
    addr,
    title: addr === PROJECT ? 'Hive' : 'Orchard',
    contentFolder,
    fields: (archived ? { archived: field('true') } : {}) as Fields,
  })
  const issue = (addr: string, projectAddr?: string, archived = false) => ({
    addr,
    projectAddr,
    fields: (archived ? { archived: field('true', B) } : {}) as Fields,
  })

  it('an issue is archived with its project, and says which', () => {
    const archives = archivesOf({
      projects: [project(PROJECT, true)],
      issues: [issue(ISSUE, PROJECT)],
      activity: [change(PROJECT, 'true', 'Swarmed.')],
    })
    expect(archives.ofIssue({ addr: ISSUE })).toEqual({ by: A, at: 10, resolution: 'Swarmed.', with: { kind: 'project', addr: PROJECT, title: 'Hive' } })
  })

  it('restoring the project restores the issue, which was never written to', () => {
    const archives = archivesOf({ projects: [project(PROJECT)], issues: [issue(ISSUE, PROJECT)], activity: [change(PROJECT, 'true'), change(PROJECT, '')] })
    expect(archives.ofIssue({ addr: ISSUE })).toBeUndefined()
  })

  it('an issue archived on its own stays archived, with no `with`, whatever its project does', () => {
    const archives = archivesOf({ projects: [project(PROJECT)], issues: [issue(LONE, PROJECT, true)], activity: [change(LONE, 'true', 'Duplicate.')] })
    expect(archives.ofIssue({ addr: LONE })).toEqual({ by: B, at: 10, resolution: 'Duplicate.' })
  })

  it('a project is archived with its team when every team listing it is archived', () => {
    const team = { id: 'team', name: 'Apiary', channel: '39000:r:team', addresses: [PROJECT], archived: { by: A, at: 30, resolution: 'Season over.' } }
    const live = { id: 'live', name: 'Orchard', addresses: [OTHER_PROJECT] }
    const archives = archivesOf({ projects: [project(PROJECT), project(OTHER_PROJECT)], issues: [issue(ISSUE, PROJECT)], activity: [] }, [team, live])
    expect(archives.ofProject(PROJECT)).toEqual({
      by: A,
      at: 30,
      resolution: 'Season over.',
      with: { kind: 'folder', addr: '39000:r:team', id: 'team', title: 'Apiary' },
    })
    expect(archives.ofProject(OTHER_PROJECT)).toBeUndefined()
    // …and its issues with it, through the project.
    expect(archives.ofIssue({ addr: ISSUE })?.with).toEqual({ kind: 'project', addr: PROJECT, title: 'Hive' })
  })

  it('a project also listed by a live team stays visible', () => {
    const archived = { id: 'team', addresses: [PROJECT], archived: { by: A, at: 30 } }
    const live = { id: 'live', addresses: [PROJECT] }
    expect(archivesOf({ projects: [project(PROJECT)], issues: [], activity: [] }, [archived, live]).ofProject(PROJECT)).toBeUndefined()
  })

  it('a project no state lists is placed by its own Folder, as the sidebar places it', () => {
    const own = { id: 'own', archived: { by: A, at: 30 } }
    expect(archivesOf({ projects: [project(PROJECT)], issues: [], activity: [] }, [own]).ofProject(PROJECT)?.with?.id).toBe('own')
  })
})
