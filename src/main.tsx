/**
 * Boot: settle who this load belongs to, then render.
 *
 * The order is load-bearing and not incidental. `api/store.ts` builds its signer
 * at module scope from whatever session exists, so the session has to be settled
 * before that module first evaluates — which means `App` is imported
 * *dynamically*, after `bootAuth()` resolves. A static import at the top of this
 * file would evaluate the store while the callback was still being redeemed, and
 * the app would come up anonymous immediately after a successful sign-in.
 *
 * That failure is silent: everything renders, the relay answers what an
 * anonymous reader may see, and the only symptom is that you are not who you
 * just signed in as.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { bootAuth, enterFromShell } from './auth/boot'
import { AuthShell } from './auth/AuthShell'

/*
  An async IIFE rather than top-level await. TLA works in a `type="module"`
  script in every browser this targets, and Vite emits it happily — but it ties
  this file to the build target for no benefit, and the failure if that target is
  ever lowered is a bundle that does not run rather than a build that complains.
*/
void (async () => {
  const root = createRoot(document.getElementById('root')!)
  const boot = await bootAuth()

  if (boot.kind === 'leaving') {
    // A navigation is in flight. Rendering now would flash a frame of something
    // the person never asked to see.
    return
  }

  if (boot.kind === 'shell') {
    root.render(
      <StrictMode>
        <AuthShell state={boot.state} onContinue={() => void enterFromShell()} />
      </StrictMode>,
    )
    return
  }

  // Imported here, not at the top: see the note above on boot order.
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()
