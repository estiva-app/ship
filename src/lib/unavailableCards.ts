import { unavailableMemory } from '@estiva-app/ui'

/**
 * Chosen cards this device last found not available — deleted, or not this
 * reader's to see — so the next open draws the one-line row from the first
 * paint instead of a card's height that then closes (Peek's OPT-10; Miky, 14
 * Oct). The kit's memory, under Ship's own key.
 */
const memory = unavailableMemory('ship.unavailable-cards', 300)

export function rememberedUnavailable(reference: string): boolean {
  return memory.has(reference)
}

export function noteCardAvailability(reference: string, available: boolean): void {
  memory.note(reference, available)
}
