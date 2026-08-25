import { ID_CONFIG, workspaceLabel } from './config'

export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2">
      <span className="text-h2 text-text-muted">Ship</span>
      {/* The workspace this build is pointed at — the same fact the old app's
          profile menu states. Anonymous until sign-in arrives (REW-2). */}
      <span className="text-caption text-text-disabled">
        {workspaceLabel()}
        {ID_CONFIG ? '' : ' · anonymous'}
      </span>
    </main>
  )
}
