// @vitest-environment jsdom
/**
 * A crash in Ship, read at the wire and on screen (PROD-4): the page that
 * crashed shows "Something went wrong … try again" and Try again draws it
 * again; the body that would leave the browser for Estiva ID holds none of the
 * text planted in an issue's title or the page address.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@estiva-app/ui'

// The sign-in's own token handling is @estiva-app/identity's, tested there; here a signed-in QA-1.
vi.mock('@/config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELEASE: 'abc123',
}))
vi.mock('@/auth/estivaId', () => ({ currentToken: () => ({ accessToken: 'qa-1-token' }) }))

const PLANTED_TITLE = 'plantedtitle board offsite'
const PLANTED_SLUG = 'plantedslug-board-offsite'

/** The reporter reads the token, then sends: a few turns of the microtask queue, no timer. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
let requests: Array<{ url: string; body: string }>

beforeEach(() => {
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      requests.push({ url, body: init.body })
      return new Response(null, { status: 202 })
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.history.pushState({}, '', `/issue/${PLANTED_SLUG}-70a66624-a6d2-4ce9-968f-e5adc23e1ede`)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Ship error reports', () => {
  it('shows the message in place of a crashed page, reports it with none of the planted text, and Try again draws the page again', async () => {
    const { startErrorReports, ScreenSteps, CrashOnPurpose } = await import('./errorReports')
    startErrorReports()
    render(
      <>
        <ScreenSteps />
        <ErrorBoundary>
          <CrashOnPurpose />
          <h1>{PLANTED_TITLE}</h1>
        </ErrorBoundary>
      </>,
    )
    act(() => window.__crashOnPurpose?.(`${PLANTED_TITLE} quarterly`))
    await flush()

    expect(screen.queryByText(PLANTED_TITLE)).toBeNull()
    expect(screen.getByText('Something went wrong. Your data is safe — try again.')).toBeTruthy()

    expect(requests.map((r) => r.url)).toEqual(['https://id.estiva.app/report'])
    const [{ body }] = requests as [{ url: string; body: string }]
    for (const planted of ['plantedtitle', 'offsite', 'quarterly', 'plantedslug']) {
      expect(body).not.toContain(planted)
    }
    const report = JSON.parse(body)
    expect(report.release).toBe('abc123')
    expect(report.how).toBe('boundary')
    expect(report.error.type).toBe('SyntaxError')
    expect(report.screen).toBe('issue')
    expect(report.trail.map((step: { screen?: string }) => step.screen)).toEqual(['issue'])

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText(PLANTED_TITLE)).toBeTruthy()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
  })

  it('says why on the report of a page that did not load: the relay’s wait, then a lapsed sign-in, never their wording', async () => {
    const { startErrorReports } = await import('./errorReports')
    const { reportFailureNow } = await import('./failureReports')
    const { heardFromRelay, hearingSigner } = await import('./heardFailures')
    const { SignerTokenExpired } = await import('@/nostr/signer')
    startErrorReports()

    // The relay's answer to a read past the per-minute limit, as the transport sees it.
    heardFromRelay('{"error":"rate-limited: quota exceeded; retry in 12s"}', 429)
    reportFailureNow('not-loaded')
    await flush()

    // Estiva ID refusing to sign because the sign-in ended: the read fails as it did, and the next report says so.
    const signer = hearingSigner({
      pubkey: 'f'.repeat(64),
      kind: 'estiva-id',
      sign: async () => {
        throw new SignerTokenExpired()
      },
    } as never)
    await expect(signer.sign({ kind: 27235, tags: [], content: '', created_at: 1 } as never)).rejects.toBeInstanceOf(SignerTokenExpired)
    reportFailureNow('not-loaded')
    await flush()

    const reports = requests.map((r) => JSON.parse(r.body))
    expect(reports.map((r) => [r.how, r.named, r.reason])).toEqual([
      ['failure', 'not-loaded', 'told-to-wait'],
      ['failure', 'not-loaded', 'signed-out'],
    ])
    for (const { body } of requests) {
      expect(body).not.toContain('quota')
      expect(body).not.toContain('expired')
    }
  })
})

describe('screenOf', () => {
  it.each([
    [`/issue/${PLANTED_SLUG}-70a66624-a6d2-4ce9-968f-e5adc23e1ede`, 'issue'],
    [`/project/${PLANTED_SLUG}-69d49dca-7c8f-4413-9a78-b79f0e47d782?tab=issues`, 'project'],
    ['/projects?tab=completed', 'projects'],
    [`/plantedword/${PLANTED_SLUG}`, 'elsewhere'],
  ])('names %s by its page, %s', async (location, name) => {
    const { screenOf } = await import('./errorReports')
    expect(screenOf(location)).toBe(name)
  })
})
