import { me, setMembership } from '@/api'
import { act, type Say } from './act'

type Target = Parameters<typeof setMembership>[0]

/**
 * What the Members dialog's Join, Leave and Invite do on an issue or project
 * page (SHI-31): one `kind:1851` per person, each said and re-read through
 * `act`. `after` re-reads the membership and the record's Folder, where the
 * change also lands in History.
 */
export function membershipActions(target: Target, say: Say, after: () => Promise<void>) {
  return {
    onSetMine: (member: boolean) => act(member ? 'Join' : 'Leave', () => setMembership(target, me, member), say, after),
    /** One at a time, stopping at the first refusal, which `act` has already said. */
    onAdd: async (pubkeys: string[]) => {
      for (const pubkey of pubkeys) {
        if (!(await act('Add member', () => setMembership(target, pubkey, true), say))) {
          await after()
          return false
        }
      }
      await after()
      return true
    },
  }
}
