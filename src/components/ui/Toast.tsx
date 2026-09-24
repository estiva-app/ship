/**
 * Ship's toast and its provider are the shared ones (@estiva-app/ui), the way
 * Peek takes them (D35, 2026-09-08): the package owns the pill, the portal,
 * the bottom-left position and the auto-dismiss. This file only keeps the
 * import path.
 */
export { Toast, ToastProvider, useToast, type ToastOptions, type ToastProps } from '@estiva-app/ui'
