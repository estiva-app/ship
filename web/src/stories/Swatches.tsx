import { useEffect, useReducer } from 'react'

/**
 * Design-token showcase primitives for the "Design Tokens" docs page.
 *
 * Colours render from live CSS variables (`var(--bg-base)`), so a swatch always
 * reflects the theme selected in the toolbar, and `useThemeTick` re-reads the
 * resolved value whenever `data-theme` on <html> changes, keeping the printed
 * hex honest. Type / radius / shadow use literal Tailwind classes so they
 * resolve the same tokens the app does — never hard-coded values.
 *
 * Peek's Swatches.tsx, minus its Peek-only tokens (bg-private, border-private).
 * Source of truth for the names: tailwind.config.js; for the values:
 * src/index.css.
 */

/** Re-render this subtree whenever the theme attribute on <html> changes. */
function useThemeTick() {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const obs = new MutationObserver(tick)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
}

function resolveVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim().toUpperCase()
}

type Token = { name: string; var: string }

const swatchLabel = 'text-[11px] leading-[14px] font-medium text-text-primary'
const swatchSub = 'text-[10px] leading-[13px] text-text-muted tabular-nums'

function ColorSwatch({ token }: { token: Token }) {
  useThemeTick()
  const hex = resolveVar(token.var)
  return (
    <div className="flex flex-col gap-1">
      <div className="h-14 w-full rounded-lg border border-border-default" style={{ background: `var(${token.var})` }} />
      <div className={swatchLabel}>{token.name}</div>
      <div className={swatchSub}>{hex || token.var}</div>
    </div>
  )
}

export function ColorGrid({ title, tokens }: { title: string; tokens: Token[] }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tokens.map((t) => (
          <ColorSwatch key={t.var} token={t} />
        ))}
      </div>
    </section>
  )
}

/** A default/muted semantic pair shown side by side (info, warning, success, error). */
export function SemanticGrid({ pairs }: { pairs: { name: string; defaultVar: string; mutedVar: string }[] }) {
  useThemeTick()
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">Semantic</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pairs.map((p) => (
          <div key={p.name} className="flex flex-col gap-1">
            <div className="flex overflow-hidden rounded-lg border border-border-default">
              <div className="h-14 flex-1" style={{ background: `var(${p.defaultVar})` }} />
              <div className="h-14 flex-1" style={{ background: `var(${p.mutedVar})` }} />
            </div>
            <div className={swatchLabel}>{p.name}</div>
            <div className={swatchSub}>
              {resolveVar(p.defaultVar)} · {resolveVar(p.mutedVar)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

type TypeToken = { token: string; cls: string; spec: string }

export function TypeRamp({ tokens }: { tokens: TypeToken[] }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {tokens.map((t) => (
        <div key={t.token} className="flex items-baseline gap-4 py-3">
          <div className="w-28 shrink-0">
            <div className="text-[12px] font-medium text-text-primary">{t.token}</div>
            <div className="text-[10px] text-text-muted">{t.spec}</div>
          </div>
          <div className={`${t.cls} text-text-primary`}>The quick brown fox</div>
        </div>
      ))}
    </div>
  )
}

type RadiusToken = { token: string; cls: string; value: string }

export function RadiusGrid({ tokens }: { tokens: RadiusToken[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
      {tokens.map((t) => (
        <div key={t.token} className="flex flex-col items-center gap-2">
          <div className={`size-16 border-2 border-accent-primary bg-accent-muted ${t.cls}`} />
          <div className="text-center">
            <div className="text-[12px] font-medium text-text-primary">{t.token}</div>
            <div className="text-[10px] text-text-muted">{t.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

type ShadowToken = { token: string; cls: string }

export function ShadowGrid({ tokens }: { tokens: ShadowToken[] }) {
  return (
    <div className="grid grid-cols-3 gap-6 py-2">
      {tokens.map((t) => (
        <div key={t.token} className="flex flex-col items-center gap-3">
          <div className={`size-20 rounded-xl bg-bg-surface ${t.cls}`} />
          <div className="text-[12px] font-medium text-text-primary">{t.token}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Token data (mirrors tailwind.config.js + src/index.css) ── */

export const BG: Token[] = [
  { name: 'bg-base', var: '--bg-base' },
  { name: 'bg-surface', var: '--bg-surface' },
  { name: 'bg-elevated', var: '--bg-elevated' },
  { name: 'bg-inset', var: '--bg-inset' },
  { name: 'bg-hover', var: '--bg-hover' },
  { name: 'bg-selected', var: '--bg-selected' },
  { name: 'bg-active', var: '--bg-active' },
  { name: 'bg-disabled', var: '--bg-disabled' },
]

export const TEXT: Token[] = [
  { name: 'text-primary', var: '--text-primary' },
  { name: 'text-secondary', var: '--text-secondary' },
  { name: 'text-muted', var: '--text-muted' },
  { name: 'text-disabled', var: '--text-disabled' },
  { name: 'text-inverse', var: '--text-inverse' },
]

export const BORDER: Token[] = [
  { name: 'border-subtle', var: '--border-subtle' },
  { name: 'border-default', var: '--border-default' },
  { name: 'border-strong', var: '--border-strong' },
  { name: 'border-focus', var: '--border-focus' },
]

export const ACCENT: Token[] = [
  { name: 'accent-primary', var: '--accent-primary' },
  { name: 'accent-hover', var: '--accent-hover' },
  { name: 'accent-muted', var: '--accent-muted' },
]

export const SEMANTIC = [
  { name: 'info', defaultVar: '--info-default', mutedVar: '--info-muted' },
  { name: 'warning', defaultVar: '--warning-default', mutedVar: '--warning-muted' },
  { name: 'success', defaultVar: '--success-default', mutedVar: '--success-muted' },
  { name: 'error', defaultVar: '--error-default', mutedVar: '--error-muted' },
]

export const TYPE: TypeToken[] = [
  { token: 'h1', cls: 'text-h1', spec: '26 / 115% / 600' },
  { token: 'h2', cls: 'text-h2', spec: '22 / 120% / 600' },
  { token: 'h3', cls: 'text-h3', spec: '18 / 120% / 600' },
  { token: 'h4', cls: 'text-h4', spec: '16 / 150% / 600' },
  { token: 'h5', cls: 'text-h5', spec: '12 / 100% / 500' },
  { token: 'body-1', cls: 'text-body-1', spec: '16 / 150% / 400' },
  { token: 'body-2', cls: 'text-body-2', spec: '14 / 140% / 400' },
  { token: 'body-2-strong', cls: 'text-body-2-strong', spec: '14 / 140% / 500' },
  { token: 'caption', cls: 'text-caption', spec: '12 / 120% / 400' },
  { token: 'menu', cls: 'text-menu', spec: '9 / 115% / 500' },
  { token: 'btn-default', cls: 'text-btn-default', spec: '14 / 14px / 500' },
  { token: 'btn-small', cls: 'text-btn-small', spec: '12 / 12px / 500' },
  { token: 'input-label', cls: 'text-input-label', spec: '12 / 115% / 500' },
  { token: 'input-value', cls: 'text-input-value', spec: '14 / 140% / 400' },
  { token: 'input-helper', cls: 'text-input-helper', spec: '12 / 120% / 400' },
  { token: 'chip', cls: 'text-chip', spec: '11 / 110% / 500' },
]

export const RADIUS: RadiusToken[] = [
  { token: 'none', cls: 'rounded-none', value: '0px' },
  { token: 'sm', cls: 'rounded-sm', value: '4px' },
  { token: 'md', cls: 'rounded-md', value: '6px' },
  { token: 'lg', cls: 'rounded-lg', value: '8px' },
  { token: 'xl', cls: 'rounded-xl', value: '12px' },
  { token: '2xl', cls: 'rounded-2xl', value: '16px' },
  { token: '3xl', cls: 'rounded-3xl', value: '24px' },
  { token: 'full', cls: 'rounded-full', value: '9999px' },
]

export const SHADOW: ShadowToken[] = [
  { token: 'shadow-sm', cls: 'shadow-sm' },
  { token: 'shadow-md', cls: 'shadow-md' },
  { token: 'shadow-lg', cls: 'shadow-lg' },
]
