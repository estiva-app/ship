---
paths:
  - "src/**/*.{ts,tsx}"
  - "scripts/smoke.ts"
---

# Ship's UI files

Ship-only rules for `src/`. The package's skill (`estiva-ui`) covers the
rest: search first, read the part's page, the known mistakes. The lint
enforces raw elements, owned behaviour, restyled parts and tokens, and its
messages name what to use.

## The three kinds of UI file, and the only three

Every piece of UI in this app comes from `@estiva-app/ui`, or wraps it with
what only Ship knows, or draws a product object nothing else has. There is no
fourth kind.

| Kind | The app knows… | Where | Example |
|---|---|---|---|
| **Shim** | nothing extra | `src/components/ui/X.tsx`, one line: `export { X } from '@estiva-app/ui'` | `Button.tsx` |
| **Wrapper** | its data, its defaults, its copy | `src/components/X.tsx`, mapping Ship's types onto the package's props and forwarding the rest | `Sidebar.tsx`: the package's shell and rows, Ship's entries and counts |
| **Product** | a product object (an issue, a project, a thread, a description) | `src/components/` (`RichText` sits in `components/ui/`) | `IssueRow`, `ProjectCard`, `RichText` |

- A file that re-implements a package component, in whole or in part, is a fork. A fork needs a ticket in `estiva-ui` saying what the package lacks, and a `// FORK: <ticket>` comment at the top. Without both it is reverted.
- A second copy of anything inside this app is a shared component wanting a name. If you are about to paste a class string you can already see in another file, stop: that string is a component. Say so and ask (the `estiva-ui` skill, step 3); she decides what goes into the package.
- **When a component moves into the package, the app file shrinks; it does not disappear.** What stays is what only Ship knows: routes, which entries exist, counts, default copy. When nothing Ship-specific remains, the file is a one-line re-export so every import path keeps working. Callers never change.

## Two things the lint does not read

- **Tables.** The package has no table yet, and no rule reads `<table>`. Two files draw one: `IssuesTable` (the issue list) and `RichText` (a table inside a document). That is not a licence for a third; a new table is a ticket to the package.
- **Class merging.** Merge classes with the package's `cn()`, re-exported from `src/lib/cn.ts`, never a plain `twMerge`: the package's knows the ramp, stock `tailwind-merge` drops a token size beside a text colour.

A token-lint exception is kept at the line, with its reason (her ruling A2):
`// eslint-disable-next-line <rule> -- @estiva-escape: <reason>`.
`src/components/ui/prose.ts` has two.

## Links: every one goes through `linkTo`

A package component that takes an `href` — `NavItem`, `Breadcrumb`, `Link`, `Card` — renders a plain `<a>`. An anchor left unwired reloads the whole app. So every link uses the one wrapper, `linkTo` in `src/router.ts`: `{...linkTo(href)}`.
Ship's own `NavItem` (`src/components/NavItem.tsx`) already does it; use that one.

## Empty states and pages

- A hand-written "Nothing here" paragraph or span is the `section` manner of `EmptyState`, and becomes it.
- **A `page` sits in the middle of its box both ways.** A page is a flex child of `main` (below), so the state takes the room left under its heading and centres there. Nothing to add; never `h-full` on its box.
- **A page keeps the frame's contract**: it is a flex child of `main` and says `flex-1` — it fills the frame and, when taller, scrolls in the frame's bar — or `flex-1 min-h-0 [contain:size]` — it takes exactly the frame's height and scrolls inside itself, in regions of its own. Never `h-full`, and never a scroll class of its own: the frame owns the bar.

## Two things the rewrite settled, both easy to undo by accident

- **`data-surface` and `data-view` on the four views are load-bearing.** They are
  `scripts/smoke.ts`'s only non-semantic selectors, present because "which
  surface is on screen" is not expressible as a role. Everything else that test
  clicks it finds by role and accessible name, on purpose — a class-name
  selector proves nothing about whether a person using a screen reader can get
  there.
- **Comments across `src/` cite `apps/ship/*` paths** as the provenance of
  ported behaviour ("copied from the old app's `ago()`"). Those files no longer
  exist. The references are kept because they say *why* the code is shaped as it
  is, and git still has them; do not "fix" them by deleting the reasoning.
