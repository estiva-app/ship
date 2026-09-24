/**
 * One description, two surfaces, one set of type styles — RIC-14.
 *
 * A description is drawn by `RichText` when it is being read and by
 * `DescriptionEditor` when it is being written, and Miky's report is about
 * the difference between them: *"It should feel like Notion. You read and edit
 * and it's 1:1."*
 *
 * **Two renderers cannot be kept 1:1 by care.** RIC-9 is the same shape one
 * level up — an issue's description resolved its references and a project's
 * did not, every suite green, because nothing knows the two are meant to
 * match. So the styling is not written twice: it is this string, applied to
 * both wrappers, addressing elements rather than components. `RichText` emits
 * `<h1>` where it used to emit a styled `<div>` for exactly this reason, and
 * ProseMirror emits `<h1>` because that is what ProseMirror does.
 *
 * ## Two spellings that are not accidents
 *
 * **No unprefixed `text-{colour}`.** `cn` is tailwind-merge, which silently
 * drops a custom `text-{size}` token followed by a colour — the caveat in
 * `lib/cn.ts`. Every size here sits behind a `[&_…]` variant, which
 * tailwind-merge treats as its own group, and the one bare size has no colour
 * beside it to be eaten by. The body colour comes from `index.css`.
 *
 * **`:not(pre) > code`.** An inline `code` run and a fence are different
 * things wearing the same tag: the fence styles the `<pre>`, and giving its
 * inner `<code>` a background as well draws a box inside a box.
 *
 * **A code block wraps.** A long line folds onto the next, keeping every space,
 * as Peek's does (Katerina's ruling of 11 September there, taken here on 16
 * September, UIG-8). It used to scroll sideways while read and wrap while
 * written, so the two surfaces did not match; now both wrap, and nothing
 * scrolls with the browser's scrollbar.
 *
 * **The list has a `_CLASSES` name, and is joined below.** The token lint reads
 * class lists in a variable of that name, and cannot read through `.join()`
 * (UIG-28 R5).
 */
const PROSE_BLOCK_CLASSES = [
  'flex flex-col gap-2 text-body-2',
  '[&_h1]:text-h3 [&_h2]:text-h4 [&_h3]:text-body-1 [&_h3]:font-semibold',
  '[&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:list-decimal [&_ol]:pl-5',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-default [&_blockquote]:pl-3',
  // eslint-disable-next-line token-values/no-restricted-classes -- @estiva-escape: code is 0.9 of the text around it, so it scales with a heading; a named size is fixed
  '[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:rounded-md [&_pre]:bg-bg-inset [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[0.9em]',
  // eslint-disable-next-line token-values/no-restricted-classes -- @estiva-escape: code is 0.9 of the text around it, so it scales with a heading; a named size is fixed
  '[&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-bg-inset [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em]',
  /*
    A table — §13.3, UIG-18. Hairlines on the cells rather than a box around
    the whole, so a table reads as a grid at any width; the header row takes
    the inset fill the way a code fence does, which is the only other place
    this file tints a background.
  */
  '[&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-border-default [&_th]:bg-bg-inset [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:font-medium',
  '[&_td]:border [&_td]:border-border-default [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_hr]:border-border-default',
  '[&_strong]:font-semibold',
  '[&_em]:italic',
  '[&_u]:underline [&_u]:underline-offset-2',
]

export const PROSE_BLOCKS = PROSE_BLOCK_CLASSES.join(' ')
