/**
 * The auth shell, in plain DOM (PEEK-116/119).
 *
 * Peek renders these states in React. This renders the same states, with the
 * same copy from the same `contract.ts`, so the two apps agree on what entry
 * looks like without sharing a component. The shared artifact is the contract —
 * see `estiva-id/docs/AUTH-SHELL.md`.
 *
 * Deliberately the same canvas in every state: a title, a line of text, and at
 * most one button. What it must never look like is a sign-in page for an
 * identity system the person is usually already signed into.
 */
import {
  CONTINUE_LABEL,
  RETRY_LABEL,
  SHELL_COPY,
  type ShellState,
  isRecoverable,
} from './contract'

const ROOT_ID = 'auth-shell'

/**
 * Cover the page.
 *
 * An overlay appended to the body, **not** a replacement for its children:
 * `app.ts` captures `#main`, `#sidebar` and friends at module load, and
 * replacing the body would leave those references pointing at detached nodes
 * for the rest of the page's life. The app would then boot and render into
 * nothing.
 *
 * Covering rather than rendering into `#main` is deliberate too. Ship's chrome
 * — the sidebar, the profile menu — is app furniture, and showing it around an
 * entry surface implies the app is available when it is not.
 */
export function renderAuthShell(state: ShellState, onContinue: () => void): void {
  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    document.body.append(root)
  }

  // Waiting states are a heading and nothing else. Entry with a live session
  // resolves fast, and anything more would flash.
  if (state.phase === 'checking' || state.phase === 'entering' || state.phase === 'ready') {
    root.replaceChildren(title())
    return
  }

  const { reason } = state
  const nodes: Node[] = [title(), line(SHELL_COPY[reason])]

  if (isRecoverable(reason)) {
    const button = document.createElement('button')
    button.className = 'primary'
    button.textContent = state.phase === 'authenticating' ? CONTINUE_LABEL : RETRY_LABEL
    button.onclick = onContinue
    nodes.push(button)
  }

  root.replaceChildren(...nodes)
}

/** Hand the page back once entry succeeded. */
export function clearAuthShell(): void {
  document.getElementById(ROOT_ID)?.remove()
}

function title(): HTMLElement {
  const el = document.createElement('h1')
  el.textContent = 'Estiva Ship'
  return el
}

function line(text: string): HTMLElement {
  const el = document.createElement('p')
  el.className = 'dim'
  el.textContent = text
  return el
}
