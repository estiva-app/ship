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
 *
 * ## `headers`, and why it is a callback
 *
 * Buzz reads more than NIP-98 off a request. A NIP-OA owner attestation travels
 * in `x-auth-tag`, and on a closed relay it is what admits an agent whose *owner*
 * is a member — so it is required on **every** call, `/query` included, not just
 * on writes.
 *
 * A callback rather than a fixed object because what it carries can expire: an
 * agent's attestation is minted with its token and replaced when that token is
 * renewed. A snapshot taken at construction would work for one TTL and then fail
 * as a `403 relay_membership_required` that looks nothing like an expiry.
 *
 * Empty by default, so a browser app that has no such credential is unaffected.
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

/** Extra headers to send with every relay request, resolved per request. */
export type RelayHeaders = () => Record<string, string> | Promise<Record<string, string>>

export class Relay {
  constructor(
    private readonly url: string,
    private readonly signer: Signer,
    /** See the note on `headers` above. Nothing extra by default. */
    private readonly headers: RelayHeaders = () => ({}),
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
        ...(await this.headers()),
        // Rebuilt per request AND unique per request — identical requests in the
        // same second would otherwise collide on the auth event id and the
        // relay rejects the second as a replay. See nip98.ts on the nonce.
        //
        // Listed after the spread so a caller's headers cannot displace it:
        // authorization is this client's own contract with the relay, not
        // something an ambient credential gets to override.
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
