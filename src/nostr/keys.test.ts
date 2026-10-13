import { describe, expect, it } from 'vitest'
import type { Issue, Project } from './fold'
import { clashes, keyOfRef, keyProblem, nextRef, projectKeys, suggestKey } from './keys'

const project = (d: string, title: string, extra: Partial<Project> = {}) =>
  ({ addr: `30850:a:${d}`, title, createdAt: 1, archived: false, fields: {}, ...extra } as Project)
const issue = (d: string, ref: string | undefined, projectAddr: string, createdAt = 1) =>
  ({ addr: `30851:a:${d}`, ref, projectAddr, createdAt, fields: {} } as unknown as Issue)
const refs = (prefix: string, n: number, projectAddr: string) =>
  Array.from({ length: n }, (_, i) => issue(`${prefix}${projectAddr}${i}`, `${prefix}-${i + 1}`, projectAddr))

describe('suggestKey', () => {
  it('takes the shortest free run of the title’s letters', () => {
    expect(suggestKey('Payment integration', new Set())).toBe('PAY')
    expect(suggestKey('Peek: Onboarding', new Set(['PEE']))).toBe('PEEK')
    expect(suggestKey('Peek: Real-time updates', new Set(['PEE', 'PEEK']))).toBe('PEEKR')
  })

  it('pads a title too short to make three letters, and folds accents', () => {
    expect(suggestKey('QA', new Set())).toBe('QAX')
    expect(suggestKey('Écoles', new Set())).toBe('ECO')
  })

  it('never hands out a taken key while a free one exists', () => {
    const taken = new Set(['ABC', 'ABCD', 'ABCDE', 'ABCDEF'])
    const key = suggestKey('Abcdef', taken)
    expect(taken.has(key)).toBe(false)
    expect(key).toMatch(/^[A-Z]{3,6}$/)
  })
})

describe('projectKeys', () => {
  it('a key on the wire wins', () => {
    const p = project('p', 'Payments', { key: 'MONEY' })
    expect(projectKeys([p], refs('PAY', 3, p.addr)).get(p.addr)).toBe('MONEY')
  })

  it('a contested prefix goes to the project holding most refs under it (Miky, 2026-10-13)', () => {
    const bugs = project('bugs', 'Peek: Feedback & Bugs', { createdAt: 5 })
    const realtime = project('rt', 'Peek: Real-time Ship→Peek updates', { createdAt: 1 })
    const keys = projectKeys([bugs, realtime], [...refs('PEE', 46, bugs.addr), ...refs('PEE', 11, realtime.addr)])
    expect(keys.get(bugs.addr)).toBe('PEE')
    expect(keys.get(realtime.addr)).toBe('PEEK')
  })

  it('a moved issue’s prefix is not a key the project can win when another holds more', () => {
    const manifests = project('man', 'Manifests', {})
    const bugs = project('bugs', 'Peek: Feedback & Bugs')
    const keys = projectKeys([manifests, bugs], [...refs('MAN', 16, manifests.addr), ...refs('PEE', 1, manifests.addr), ...refs('PEE', 46, bugs.addr)])
    expect(keys.get(manifests.addr)).toBe('MAN')
    expect(keys.get(bugs.addr)).toBe('PEE')
  })

  it('an archived project without a key gets none, and its prefix stays taken', () => {
    const old = project('old', 'Shrinking Convex', { archived: true })
    const fresh = project('new', 'Shrine', {})
    const keys = projectKeys([old, fresh], refs('SHR', 9, old.addr))
    expect(keys.has(old.addr)).toBe(false)
    expect(keys.get(fresh.addr)).toBe('SHRI')
  })

  it('no two visible projects share a derived key', () => {
    const ps = ['Peek A', 'Peek B', 'Peek C', 'Peek D'].map((t, i) => project(`p${i}`, t))
    const keys = [...projectKeys(ps, []).values()]
    expect(new Set(keys).size).toBe(ps.length)
  })
})

describe('keyProblem', () => {
  const bugs = project('bugs', 'Peek: Feedback & Bugs')
  const all = refs('PEE', 3, bugs.addr)
  it('names the project holding it', () => {
    expect(keyProblem('PEE', [bugs], all)).toBe('PEE is used by Peek: Feedback & Bugs.')
  })
  it('refuses a shape that is not a key', () => {
    expect(keyProblem('PE', [bugs], all)).toBe('A key is 3–6 letters, A to Z.')
  })
  it('refuses a prefix older issues carry, even with no project holding it', () => {
    expect(keyProblem('OLD', [bugs], [...all, issue('o', 'OLD-4', 'gone')])).toBe('OLD is already used by older issues.')
  })
  it('accepts a free one', () => {
    expect(keyProblem('ONB', [bugs], all)).toBeUndefined()
  })
})

describe('nextRef', () => {
  it('counts every ref under the key, wherever it is, and only that key', () => {
    expect(nextRef('PEE', ['PEE-1', 'PEE-46', 'PEEK-90', 'SHI-3', undefined])).toBe('PEE-47')
    expect(nextRef('NEW', [])).toBe('NEW-1')
    expect(keyOfRef('PEEK-90')).toBe('PEEK')
  })
})

describe('clashes', () => {
  const a = { addr: 'a', createdAt: 100, fields: {} }
  const b = { addr: 'b', createdAt: 200, fields: {} }
  it('the later claim gives way, and only when this client made it', () => {
    expect(clashes([a, b], () => 'PEE-8', 'ref', new Set(['b']))).toEqual([b])
    expect(clashes([a, b], () => 'PEE-8', 'ref', new Set(['a']))).toEqual([])
  })
  it('a change’s time is the claim’s time, not the root’s', () => {
    const late = { addr: 'c', createdAt: 50, fields: { ref: { at: 300 } } }
    expect(clashes([a, late], () => 'PEE-8', 'ref', new Set(['c']))).toEqual([late])
  })
  it('a tie goes to the lower address', () => {
    const twin = { addr: 'z', createdAt: 100, fields: {} }
    expect(clashes([twin, a], () => 'PEE-8', 'ref', new Set(['a', 'z']))).toEqual([twin])
  })
})
