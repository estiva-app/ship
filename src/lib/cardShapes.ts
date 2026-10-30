import { cardShapeMemory } from '@estiva-app/ui'

/**
 * The shape and height each chosen card last drew at on this device, so its
 * placeholder is the card's own height and a conversation does not move as its
 * cards load (peek#533, #534): the kit's memory (ui 0.92), under Ship's own key.
 *
 * An issue not drawn here before gets a title and its pickers: the kit's own
 * placeholder has room for a key line and a summary, which most issue cards do
 * not draw, so it closed by 46 px as it drew (Peek, 16 Oct).
 */
export const cardShapes = cardShapeMemory('ship.card-shapes', { firstDraw: { issue: { subtitle: false, summary: false, footer: 'pickers' } } })
