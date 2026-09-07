/**
 * `act` — the write seam, and the two things it must not get wrong.
 *
 * A refusal that is a *quota* is not a rejection, and a write whose result is
 * not in the fold must not pay for a workspace read. Both are cheap to assert
 * and both were found in production rather than here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from './act'
import { resetRelayBudget } from '@/lib/relayBudget'

beforeEach(() => resetRelayBudget())

const ok = async () => ({ ok: true }) as const
const refusedWith = (reason: string) => async () => ({ ok: false, reason }) as const

describe('act', () => {
  it('re-reads the workspace after a write whose result is in the fold', async () => {
    const refresh = vi.fn(async () => {})
    expect(await act('Status', ok, () => {}, refresh)).toBe(true)
    expect(refresh).toHaveBeenCalledOnce()
  })

  /*
    The regression this file exists for. A reaction is a kind:7 — no `h`, never
    part of a Folder read — so re-reading the workspace spends one request per
    Folder (38 against production) to learn nothing, on a 300/min budget shared
    with Peek. It showed up as "rate-limited" in *Peek's* console.
  */
  it('does not re-read when the caller passes no refresh', async () => {
    const refresh = vi.fn(async () => {})
    expect(await act('Reaction', ok, () => {})).toBe(true)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('never re-reads after a refusal', async () => {
    const refresh = vi.fn(async () => {})
    expect(await act('Status', refusedWith('not a channel member'), () => {}, refresh)).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('says a real refusal with its reason', async () => {
    const said: string[] = []
    await act('Delete', refusedWith('must be event author'), (t) => said.push(t))
    expect(said[0]).toBe('Delete rejected — must be event author')
  })

  /*
    SHI-12's rule, applied to writes. A working relay declining to answer right
    now is not the same as one judging the message and saying no, and
    "Reaction rejected — rate-limited: quota exceeded; retry in 14s" reads as
    the second.
  */
  it('reports a quota refusal as busy, with the relay’s own wait', async () => {
    const said: string[] = []
    await act('Reaction', refusedWith('rate-limited: quota exceeded; retry in 14s'), (t) => said.push(t))
    expect(said[0]).toBe('Too busy right now — try again in 14s.')
    expect(said[0]).not.toContain('rejected')
  })

  it('still says something useful when the relay gives no wait', async () => {
    const said: string[] = []
    await act('Reaction', refusedWith('rate-limited: quota exceeded'), (t) => said.push(t))
    expect(said[0]).toBe('Too busy right now — try again shortly.')
  })
})
