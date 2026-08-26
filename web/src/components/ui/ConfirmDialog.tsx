import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'

/**
 * A question with two answers, before something a person would want back.
 * `@estiva-app/ui` candidate — nothing here knows what is being confirmed.
 *
 * The confirm button is `destructive` when the action is (a deletion, an
 * archive); `primary` otherwise. While the action runs the buttons wait;
 * an action that resolves `false` keeps the dialog open, so the caller's
 * banner can say why.
 */
export interface ConfirmDialogProps {
  title: string
  /** The body — plain sentences, `text-body-2`. */
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => Promise<boolean | void> | boolean | void
  onClose: () => void
}

export function ConfirmDialog({ title, children, confirmLabel, destructive = false, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      const ok = await onConfirm()
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogShell
      title={title}
      onClose={onClose}
      bodyClassName="flex flex-col gap-3 text-body-2 text-text-primary"
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => void confirm()} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </DialogShell>
  )
}
