# Using the shared UI in Ship

**The rule: this app builds no piece of UI that `@estiva-app/ui` already owns, and owns nothing that another Estiva app would also need.** Before you write a component, a class list or a colour, you check the package. This document says how, and what the checks are. It is imported into `CLAUDE.md`, so every Claude Code session in this repository reads it at launch; a person should read it once.

It exists because the opposite has happened repeatedly and been found only by audit: the sign-in screen rendered transparent because three of its class names did not exist; the same "disabled button with a reason" was written by hand six times; an unread marker had no colour because its token was misspelt; a shared component was imported on line 2 and re-typed by hand on line 118. None of it was carelessness. All of it was somebody writing UI without first looking at what was already there, in a place nothing checked.

---

## 1. The three kinds of UI file, and the only three

| Kind | The app knows… | Where | Example |
|---|---|---|---|
| **Shim** | nothing extra | `web/src/components/ui/X.tsx`, one line: `export { X } from '@estiva-app/ui'` | `Button.tsx` |
| **Wrapper** | its data, its defaults, its copy | `web/src/components/X.tsx`, 10–80 lines mapping Ship's types onto the package's props and forwarding the rest | `Sidebar.tsx`: the package's shell and rows, Ship's entries and counts |
| **Product** | a product object (an issue, a project, a thread, a description) | `web/src/components/` | `IssueRow`, `ProjectCard`, `RichText` |

Anything else is a mistake. In particular:

- A file that re-implements a package component, in whole or in part, is a fork. A fork needs a ticket in `estiva-ui` saying what the package lacks, and a `// FORK: <ticket>` comment at the top. Without both it is reverted.
- A product component that draws a button, a chip, a field, a select, a tooltip, a dialog, an avatar, a divider, an empty state or a skeleton draws them **with the package's components**, through the shims in `web/src/components/ui/`. It never re-types their class lists.
- A second copy of anything inside this app is a shared component wanting a name. If you are about to paste a class string you can already see in another file, stop: that string is a component, and it belongs in the package.

---

## 2. Before you write: three checks, in order

**a. Does the package have it?** Read the component's page first: `web/node_modules/@estiva-app/ui/src/<Component>.mdx` ships with the package and has its *When*, *When not* (which names the alternative), *How*, and its Keys table. The decision table by need is `Choosing.mdx`: read it from the `estiva-ui` checkout beside this one (`../estiva-ui/stories/Choosing.mdx`) or in the package Storybook on `:6008`; from `0.6.1` it ships in the package too. **Do not use a component whose page you have not read.** For the list of exports: `grep "^export" web/node_modules/@estiva-app/ui/dist/index.d.ts`. Do not trust memory of it.

**b. Does Ship already wrap it?** Look in `web/src/components/ui/` and `web/src/components/` before anywhere else. A wrapper that exists is the thing to call.

**c. Is something nearly it?** Then the package gets the prop. Ship's `destructive` Button variant, `vertical` Divider and `leading` Select option all arrived that way: the app's need became the package's prop, in a package PR, and Ship adopted the next version. That is the only route.

---

## 3. Behaviour is never written here

The package rents every behaviour from Base UI, and so does this app, through the package. No file in `web/src` contains:

- `createPortal`, or its own positioning of anything that floats;
- an Escape handler, arrow-key handling, a roving tab index, outside-click logic, a focus trap;
- a hand-made `role="button"`, `role="dialog"`, `role="menu"`, `role="tooltip"`;
- a raw `<dialog>`, `<select>`, or a `<button>` / `<input>` / `<textarea>` styled by hand. (`IssuesTable`'s raw `<table>` is the one standing exception until the package has a table; it is not a licence for a second.)

The one legitimate Escape handler in this app is inside the description editor (revert an edit), because the editor owns its keyboard. Everything else comes from a package component. If no package component does what you need, that is a ticket, not a `useEffect`.

**The one behaviour the package cannot give you: navigation.** A package component that takes an `href` — `NavItem`, `Breadcrumb` — renders a plain `<a>` and nothing more. It cannot navigate for you, because it does not know this app's router. **An anchor left unwired reloads the whole page**: the app restarts, every read begins again, and the navigation itself goes blank until it finishes. So a link is wrapped once here and every link uses that wrapper — `linkTo` in `router.ts`. Modified clicks (Ctrl, Cmd, Shift, Alt, any button but the first) are left alone so open-in-new-tab keeps working, and the `href` stays real so the link can still be copied and pasted. This is what **SHI-20** was: the sidebar was plain anchors, so every click reloaded Ship and the project list vanished until the workspace had been read again. Peek's `NavItem` is the same wrapper around `RailItem`; copy it rather than writing a third answer.

---

## 4. Tokens, and the class-name trap

Colours and sizes come from the token names in `@estiva-app/ui/tailwind-preset`, never from Tailwind's defaults and never from raw values.

| Never | Always |
|---|---|
| `text-sm` `text-xs` `text-lg` `text-base` | `text-body-2` `text-caption` `text-h3` `text-body-1` |
| `bg-gray-100` `text-white` `bg-emerald-500` | `bg-bg-inset` `text-text-inverse` `bg-success-default` |
| `border-[rgba(63,222,140,0.3)]`, `#8B5CF6` | a token; if none fits, a token added to the package in every theme |
| `bg-bg-inset/40` | `bg-bg-inset`, or a transparent token from the package (D16; the first ones, `bg-scrim` among them, arrive with the migration): opacity modifiers on token colours compile to nothing, and the package lint rejects them |

**The doubled prefix.** The colour tokens are named `bg-surface`, `text-primary`, `border-default`, so the classes are **`bg-bg-surface`**, **`text-text-primary`**, **`border-border-default`**. The doubled form looks wrong and is correct. `bg-surface`, `text-content`, `text-accent-default` look natural, compile to nothing, and are dropped in silence.

The type ramp: `h1`–`h5`, `body-1`, `body-2`, `body-2-strong`, `caption`, `menu`, `chip`, `btn-default`, `btn-small`, `input-label`, `input-value`, `input-helper`. Tailwind's `text-sm` is 14px with a 20px line height and no weight; `body-2` is 14px at 140 %. The number matches and nothing else does.

Class lists are merged with the package's `cn()`, re-exported from `web/src/lib/cn.ts`, never a plain `twMerge`: the package's knows the ramp, stock `tailwind-merge` drops a token size beside a text colour.

**Until the lint lands, check by building.** A lint that fails the build on an unknown class, a conflicting class, or a Tailwind default is being added to the package first and then here (`eslint-plugin-better-tailwindcss`). Until it is in this repository, prove a class exists the way the audits did:

```bash
cd web && npx tailwindcss -i ./src/index.css -o /tmp/check.css && grep -c '\.bg-bg-surface{' /tmp/check.css   # 1 = exists, 0 = does not
```

A deliberate exception (a component that must not follow the theme) is documented in the file's header comment and, once the lint exists, listed in its config; it is never silenced at the line.

---

## 5. Before you call it done

- **Every UI file has a story.** A component without a story is unreviewed, and the only Ship file that shipped broken was the one without one. Dialogs, rails, cards, rows, screens, the auth shell: all of them.
- **Render it and measure it.** Open it in Ship's Storybook (`npm --prefix web run storybook`, `:6007`) and compare against the package component it is built from: height, radius, padding, colour. The `.verify-*.mjs` scripts and `.verify-shots/` tooling in the `peek` checkout beside this one do that against `:6008`. "It looks right" is not a result.
- **Restart Storybook** after any change to Tailwind config, the package version, or a file you replaced with a re-export.
- **Check the theme.** A colour that resolves in the package Storybook but not here came from outside the token set.
- **Build**: `npm --prefix web run build` is the typecheck; it must be green.

---

## 6. When a component moves into the package

**The app file shrinks; it does not disappear.** What stays is what only Ship knows: routes, which entries exist, counts, default copy. When nothing Ship-specific remains, the file is a one-line re-export so every import path keeps working. Callers never change.

The package's docs are product-agnostic; a component that needs a product noun to make sense is not going into the package, and the ticket says why.

---

## 7. For Claude sessions specifically

You will be asked to add UI. Before the first line:

1. This file is already in your context; act on it.
2. Read the component's `.mdx` in `web/node_modules/@estiva-app/ui/src/` and `Choosing.mdx`. Quote the *When not* line back to yourself before choosing.
3. List `web/src/components/ui/`.
4. Grep for the class string you are about to write. If it exists elsewhere in the app, you are writing a component, and it goes to the package.
5. Never recall a token name, a prop or an export; grep for it. A recalled name has been wrong before, and a wrong class name fails silently.
6. Give it a story. Measure it. Build. Then say what you measured, not what you saw.

If a rule here blocks the work, say so and stop; do not route around it. The person asking would rather hear "the package has no X" than get a hand-rolled X.

---

## The short version

1. Check the package (read the page). Check `web/src/components/ui/`. Check for a near-match.
2. Extend the package, never fork here.
3. Tokens only, doubled prefix, no opacity modifiers, package `cn()`. Prove a class exists.
4. No portals, no key handling, no roles by hand. Behaviour comes from the package.
   Except navigation: a package link is a bare anchor, so wire it with `linkTo` or the page reloads.
5. A story for every file; measure, do not eyeball.
6. Same class string twice: you wrote a component.
