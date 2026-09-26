import { gateConfig } from '@estiva-app/ui/gates'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The UI Guardrails' rules on their own — `npm run lint:rules`, CI's job `gate`
 * (GitHub requires it on main: never rename it), and the config the editor hook
 * lints a proposed write with.
 *
 * The gate is the package's own piece, `gateConfig` in `@estiva-app/ui/gates`,
 * imported (UIG-32, estiva-ui docs/GATES.md §23): the rules, where they apply
 * (every `.ts` and `.tsx` under `src`, stories included, tests not) and the
 * plugins whose directives must not break it. Ship says only what is Ship's:
 * React's hooks plugin, whose `exhaustive-deps` directives three hooks in
 * `api/` carry.
 *
 * `npm run lint` runs everything, these included. This config runs the gate by
 * itself, so it can fail on a raw element and on nothing else. Zero errors the
 * day it landed.
 *
 * A place that keeps something the gate refuses says why, on the line above:
 * `// @estiva-escape(<rule>): <reason>`, or `{/* @estiva-escape(<rule>): <reason> *\/}`
 * as a JSX child, naming the rule it keeps off (0.36.0). Never `eslint-disable`:
 * the count refuses it.
 */
export default gateConfig({ quiet: { 'react-hooks': reactHooks } })
