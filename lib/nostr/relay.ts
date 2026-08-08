/**
 * Minimal Nostr relay client for the demo apps.
 *
 * Talks to a Buzz relay's HTTP bridge (`POST /events`, `POST /query`) with
 * NIP-98 auth. Browser-oriented and deliberately tiny — a demo app should be
 * readable end to end in a couple of minutes.
 *
 * Behaviours here were established against a running relay, not inferred. The
 * two that bite:
 *
 *  - **HTTP 200 does not mean accepted.** A duplicate channel create returns
 *    `200 {"accepted":false,"message":"duplicate: channel already exists"}`.
 *    The `accepted` field is authoritative.
 *  - **`/query` takes a bare ARRAY of filters**, not a single filter object.
 */
import { authorizationHeader } from './nip98'
import type { Signer } from './signer'
import type { SignedEvent } from './events'

export interface PublishResult {
  ok: boolean
  eventId?: string
  reason?: string
  /** The relay already had this state — not a failure. */
  duplicate?: boolean
}

export class Relay {
  constructor(
    private readonly url: string,
    private readonly signer: Signer,
  ) {
    this.url = url.replace(/\/+$/, '')
  }

  private async post(path: string, payload: unknown): Promise<{ status: number; text: string }> {
    const url = `${this.url}${path}`
    const body = JSON.stringify(payload)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Rebuilt per request AND unique per request — identical requests in the
        // same second would otherwise collide on the auth event id and the
        // relay rejects the second as a replay. See nip98.ts on the nonce.
        authorization: await authorizationHeader(this.signer, { url, method: 'POST', body }),
      },
      body,
    })
    return { status: res.status, text: await res.text() }
  }

  async publish(event: SignedEvent): Promise<PublishResult> {
    const { status, text } = await this.post('/events', event)
    let parsed: { accepted?: boolean; event_id?: string; message?: string; error?: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, reason: text.slice(0, 200) }
    }
    if (status < 200 || status >= 300) {
      return { ok: false, reason: parsed.error ?? text.slice(0, 200) }
    }
    if (parsed.accepted === false) {
      const duplicate = (parsed.message ?? '').startsWith('duplicate:')
      return { ok: duplicate, duplicate, eventId: parsed.event_id, reason: parsed.message }
    }
    return { ok: true, eventId: parsed.event_id }
  }

  /** `filters` is an array — the bridge expects `Vec<Value>`. */
  async query(filters: Record<string, unknown>[]): Promise<SignedEvent[]> {
    const { status, text } = await this.post('/query', filters)
    if (status < 200 || status >= 300) throw new Error(`query failed: ${text.slice(0, 200)}`)
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  }
}
