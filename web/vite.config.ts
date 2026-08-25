import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The dev server takes :5191 so the old app can keep :5190 beside it — the two
// run side by side until the cutover (REW-8). Output shape and the three
// build-time values (RELAY_URL, ID_BASE, CLIENT_ID) arrive in a later step.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
