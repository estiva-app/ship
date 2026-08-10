/**
 * The private directory — who somebody is, beyond what the relay says (PEEK-50).
 *
 * A person has two halves and they live in different places on purpose:
 *
 * | | Where | Carries |
 * | --- | --- | --- |
 * | Public | `kind:0` on the relay | display name, avatar, `nip05` handle |
 * | Private | this API | email, role, status |
 *
 * **The email is deliberately not on the relay and never will be.** A relay is
 * shared and a published event cannot be taken back, so an email in a `kind:0`
 * is an email given away permanently — and Nostr's slot for a public identifier
 * is `nip05`, not a contact address. So "show me a colleague's name, email and
 * avatar" is answered by joining two sources on the pubkey, which is what this
 * module is for.
 *
 * ## Only for people who are signed in
 *
 * The endpoint takes a bearer token, so an anonymous Ship user gets nothing —
 * correctly. They are not a member of the workspace and there is no reason they
 * should see colleagues' contact details. Everything degrades to the public
 * profile, which is where this app started.
 *
 * ## Lookup, never listing
 *
 * There is no endpoint that returns everybody, and asking for one would be
 * asking Estiva ID to hand an app token the staff directory. A caller passes the
 * pubkeys it already saw on events it could already read.
 */
import type { EstivaIdConfig, EstivaIdSession } from '../auth/estiva-id'

/** What Estiva ID knows that the relay does not. */
export interface Member {
  pubkey: string
  /** Estiva ID's idea of their name. The relay's `kind:0` is still authoritative on screen. */
  displayName: string | null
  /** Never published to a relay. The point of this whole module. */
  email: string | null
  role: 'admin' | 'member'
  /**
   * `offboarded` matters here: a leaver's name and email still resolve, because
   * their old issues have to keep rendering as written by a person, but an app
   * should not show them as a current colleague.
   */
  status: 'active' | 'suspended' | 'offboarded'
}

export type MemberDirectory = Map<string, Member>

/**
 * The endpoint's own cap. Chunked rather than truncated: a busy project can
 * easily have more than this many distinct authors, and silently dropping the
 * tail would make some people render with contact details and others without,
 * for no reason anybody could see.
 */
const MAX_PER_REQUEST = 200

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Look up the members among a set of pubkeys.
 *
 * **Pubkeys that belong to nobody are simply absent from the result**, which is
 * the common case rather than an error: every anonymous Ship user is a key
 * Estiva ID has never seen. Callers render the public profile for anyone
 * missing.
 *
 * Failure returns an empty map rather than throwing. Contact details are a
 * nicety layered on top of a record that already loaded — the same judgement
 * `learn()` makes about names — and a banner about the directory over a
 * perfectly good issue list would be noise.
 */
export async function lookupMembers(
  config: EstivaIdConfig,
  session: EstivaIdSession,
  pubkeys: string[],
): Promise<MemberDirectory> {
  const found: MemberDirectory = new Map()
  if (!pubkeys.length) return found

  const base = config.base.replace(/\/+$/, '')

  for (const batch of chunk([...new Set(pubkeys)], MAX_PER_REQUEST)) {
    try {
      const response = await fetch(`${base}/directory/lookup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ pubkeys: batch }),
      })
      if (!response.ok) continue

      const body = (await response.json()) as { contacts: Member[] }
      for (const contact of body.contacts) found.set(contact.pubkey, contact)
    } catch {
      // Network, CORS, an expired token — none of it is worth interrupting
      // somebody reading an issue over.
    }
  }

  return found
}
