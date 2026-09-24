/**
 * Seed a Folder that Peek can actually render, and print the reference to paste.
 *
 * Exists because of the one step everybody forgets: Peek's *reading identity*
 * must be a member of the Folder. Objects and change events are channel-scoped,
 * so a non-member's query returns zero rows — no error, just silence, which
 * looks exactly like a broken reference (FRICTION.md A7).
 *
 * Get Peek's pubkeys first:
 *
 *   cd ~/peek-app && CONVEX_AGENT_MODE=anonymous \
 *     npx convex run nostr/data:listLocalPubkeys '{}'
 *
 * Then pass them all — `sync.ts` picks the first user with a key, so granting
 * only one makes the widget a coin flip:
 *
 *   npm run seed:peek -- <pubkey> [<pubkey> …]
 */
import { Relay } from '@estiva-app/protocol'
import { secretKeySigner } from '../lib/nostr/signer'
import { publicKeyFromSecret, signEvent } from '@estiva-app/protocol'
import { buildAddMember, buildProfile } from '@estiva-app/protocol'
import { Store } from '../src/store'
import { addrToNaddr } from '@estiva-app/protocol'

const RELAY_URL = 'http://localhost:3000'
const PEEK_READERS = process.argv.slice(2)

async function main() {
  const secretKeyHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  const identity = { secretKeyHex, pubkey: publicKeyFromSecret(secretKeyHex) }
  const signer = secretKeySigner(secretKeyHex)
  const relay = new Relay(RELAY_URL, signer)
  const store = new Store(relay, signer)
  await store.recommendHandler(RELAY_URL)

  /**
   * Optional now that Folders are open. Kept because an explicitly-membered
   * Folder is the realistic shape for anything private, and this is the only
   * place that demonstrates it.
   *
   * A project is a Folder, so this is granted once per project.
   */
  const grant = async (folder: string, label: string) => {
    for (const pubkey of PEEK_READERS) {
      const r = await relay.publish(
        signEvent(
          buildAddMember(identity.pubkey, Date.now(), {
            channelUuid: folder,
            targetPubkey: pubkey,
            role: 'member',
          }),
          secretKeyHex,
        ),
      )
      console.log(`member ${pubkey.slice(0, 12)}… → ${label} ${r.ok ? 'ok' : `FAILED ${r.reason}`}`)
    }
  }
  // A project is filed into a team (FOL-2); a bare channel stands in for one here.
  const team = crypto.randomUUID()
  await store.ensureFolder(team, `team-${team.slice(0, 8)}`)
  const project = await store.createProject({
    title: 'Payment integration',
    description: 'Stripe Checkout for workspace billing — redirect flow, no custom card form.',
    team: { folder: team, hasState: false },
  })
  const folder = project.folder
  await grant(folder, 'project')
  const issue = await store.createIssue({
    folder,
    title: 'Billing entry + add payment method',
    description: 'Entry point in settings, plus the empty-state when no card is on file.',
    projectAddr: project.addr,
    ref: 'PAY-1',
  })
  await store.setField({ folder, target: issue.addr, field: 'status', value: 'in_progress' })
  await store.setField({ folder, target: issue.addr, field: 'assignee', value: identity.pubkey })
  await store.setField({ folder, target: issue.addr, field: 'status', value: 'done' })
  /**
   * A profile for the throwaway identity above, so the demo author renders as
   * a name rather than 64 hex characters.
   *
   * **Here and not on `Store`.** Estiva ID is the sole publisher of `kind:0`
   * (PEEK-48), and the app must have no way to write one — leaving a
   * `publishProfile` on the data layer is exactly the affordance that lets it
   * creep back. This key is minted by `crypto.getRandomValues` a few lines up
   * and lives for the length of this script, so no identity service could know
   * about it and nothing here competes with a real person's profile.
   */
  await relay.publish(
    signEvent(buildProfile(identity.pubkey, Date.now(), { name: 'Estiva Ship demo' }), secretKeyHex),
  )
  await store.postMessage({ folder, about: issue.addr, body: 'Blocked on the Stripe key.' })

  console.log(`\nfolder  ${folder}   (the project IS this Folder — pair a Peek topic with it)`)
  console.log(`ISSUE   nostr:${addrToNaddr(issue.addr, [RELAY_URL])}`)
  console.log(`PROJECT nostr:${addrToNaddr(project.addr, [RELAY_URL])}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
