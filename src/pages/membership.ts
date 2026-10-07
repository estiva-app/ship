import { me, setMembership } from '@/api'
import { act, type Say } from './act'

type Target = Parameters<typeof setMembership>[0]

/**
 * What the Members dialog's Join, Leave and Invite do on an issue or project
 * page (SHI-31): one `kind:1851` per person, each said and re-read through
 * `act`. `after` re-reads the membership and the record's Folder, where the
 * change also lands in History. A refusal is worded as Peek words it
 * (863f48d): what did not change, then the relay's reason.
 */
export function membershipActions(target: Target, title: string, nameOf: (pubkey: string) => string, say: Say, after: () => Promise<void>) {
  return {
    onSetMine: (member: boolean) =>
      act(member ? 'Join' : 'Leave', () => setMembership(target, me, member), say, after, (reason) => `Nothing changed: “${title}” could not be ${member ? 'joined' : 'left'}. ${reason}`),
    /** One at a time, stopping at the first refusal, which `act` has already said. */
    onAdd: async (pubkeys: string[]) => {
      for (const pubkey of pubkeys) {
        const added = await act('Add member', () => setMembership(target, pubkey, true), say, undefined, (reason) => `Nothing changed: ${nameOf(pubkey)} could not be added to “${title}”. ${reason}`)
        if (!added) {
          await after()
          return false
        }
      }
      await after()
      return true
    },
  }
}
