import { useWorkspace } from '@/api'
import { ID_CONFIG, workspaceLabel } from './config'
import { useRoute } from './router'

/**
 * The shell, before any screen is ported. What it shows is the proof that the
 * scaffold is wired: the workspace counts come through the data seam from the
 * relay this build is pointed at, and stay fresh on the old app's schedule.
 */
export default function App() {
  const { state, error } = useWorkspace()
  const route = useRoute()

  const active = state ? state.projects.filter((p) => !p.archived).length : null
  const issues = state ? state.issues.length : null

  return (
    <main className="flex h-full flex-col items-center justify-center gap-2">
      <span className="text-h2 text-text-muted">Ship</span>
      <span className="text-caption text-text-disabled">
        {workspaceLabel()}
        {ID_CONFIG ? '' : ' · anonymous'}
        {' · '}
        {route.name}
      </span>
      {error ? (
        <span className="text-caption text-error-default">{error}</span>
      ) : state ? (
        <span className="text-caption text-text-secondary" data-testid="counts">
          {active} projects · {issues} issues
        </span>
      ) : (
        <span className="text-caption text-text-disabled">…</span>
      )}
    </main>
  )
}
