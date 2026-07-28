/**
 * The comment thread — NIP-22 `kind:1111`, not a Linear-lite kind.
 *
 * That is the point of using it: Peek reads and writes these same events, so a
 * comment left in Peek appears here and a comment left here appears in Peek,
 * without either app owning the format or knowing the other exists.
 *
 * Works on any address, so a project and an issue share one implementation —
 * which is also what makes a project's thread and its Peek topic the same
 * conversation.
 */
import type { Ctx } from '../context'
import { ago, empty, h } from '../ui'

export function thread(ctx: Ctx, args: { target: string; folder: string }): HTMLElement {
  const panel = h('div', { class: 'thread' })
  const comments = ctx.state.comments.get(args.target) ?? []

  if (!comments.length) panel.append(empty('No comments yet.'))

  for (const comment of comments) {
    panel.append(
      h(
        'div',
        { class: 'comment' },
        h('div', {
          class: 'byline',
          text: `${ctx.who(comment.author)} · ${ago(comment.createdAt)}`,
        }),
        h('div', { class: 'comment-body', text: comment.body }),
      ),
    )
  }

  const form = h('form', { class: 'comment-form' })
  const input = h('input', { placeholder: 'Write a comment…', required: true })
  const submit = h('button', { class: 'primary', type: 'submit', text: 'Comment' })
  form.append(input, submit)
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!input.value.trim()) return
    submit.disabled = true
    const ok = await ctx.publish('Comment', () =>
      ctx.store.comment({ folder: args.folder, target: args.target, body: input.value.trim() }),
    )
    submit.disabled = false
    if (ok) {
      input.value = ''
      await ctx.reload()
    }
  }
  panel.append(form)
  return panel
}
