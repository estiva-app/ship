/**
 * Conversations — the same shape Peek shows in a topic, because it is the same
 * events.
 *
 * A `kind:9` with no `e` tag starts a conversation; replies hang off it. Peek
 * calls the root a message and the rest replies; on the wire they are identical,
 * so nothing is copied or synchronised here — this is the topic's conversation
 * list, read out of the Folder and grouped.
 *
 * Two entry points, matching the two things a person does: start a new
 * conversation, or reply inside one.
 */
import type { Conversation, Message } from '../../../src/fold'
import type { Ctx } from '../context'
import { addrToNaddr } from '../../../lib/nostr/nip19'
import { ago, empty, h } from '../ui'

export function conversations(
  ctx: Ctx,
  args: {
    /** Conversations to show. */
    list: Conversation[]
    /** The Folder new messages go into. */
    folder: string
    /** The object a new conversation here is about. */
    about: string
    /** Append a reference so other apps can see what a new thread concerns. */
    withReference: boolean
    relayUrl: string
  },
): HTMLElement {
  const panel = h('div', { class: 'conversations' })

  panel.append(composer(ctx, args))

  if (!args.list.length) {
    panel.append(empty('No conversations yet.'))
    return panel
  }

  for (const conversation of args.list) {
    panel.append(conversationBlock(ctx, conversation, args))
  }
  return panel
}

/** Start a new conversation. */
function composer(
  ctx: Ctx,
  args: { folder: string; about: string; withReference: boolean; relayUrl: string },
): HTMLFormElement {
  const form = h('form', { class: 'composer' })
  const input = h('input', { placeholder: 'Start a conversation…', required: true })
  const submit = h('button', { class: 'primary', type: 'submit', text: 'Post' })
  form.append(input, submit)

  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!input.value.trim()) return
    submit.disabled = true
    const ok = await ctx.publish('Message', () =>
      ctx.store.postMessage({
        folder: args.folder,
        body: input.value.trim(),
        about: args.about,
        // The naddr goes in the body so Peek renders the object's widget above
        // the message. Without it a comment arrives in the topic as a bare line
        // with nothing saying what it refers to.
        aboutRef: args.withReference
          ? `nostr:${addrToNaddr(args.about, [args.relayUrl])}`
          : undefined,
      }),
    )
    submit.disabled = false
    if (ok) {
      input.value = ''
      await ctx.reload()
    }
  }
  return form
}

function conversationBlock(
  ctx: Ctx,
  conversation: Conversation,
  args: { folder: string; relayUrl: string },
): HTMLElement {
  const block = h('div', { class: 'conversation' })
  block.append(messageRow(ctx, conversation.root, 'root'))

  for (const reply of conversation.replies) {
    block.append(messageRow(ctx, reply, 'reply'))
  }

  // Replying targets the thread root, which is what Buzz's `threadTags` and
  // Peek's importer both expect. Replying to a reply would need the parent's id
  // as well; flat-within-a-thread matches how Peek shows them.
  const form = h('form', { class: 'reply-form' })
  const input = h('input', { placeholder: 'Reply…', required: true })
  const submit = h('button', { type: 'submit', text: 'Reply' })
  form.append(input, submit)
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!input.value.trim()) return
    submit.disabled = true
    const ok = await ctx.publish('Reply', () =>
      ctx.store.postMessage({
        // The reply goes in the Folder the thread is in, which is not
        // necessarily the project's current one if it has been re-linked.
        folder: conversation.root.folder || args.folder,
        body: input.value.trim(),
        replyTo: { rootId: conversation.id, parentId: conversation.id },
      }),
    )
    submit.disabled = false
    if (ok) {
      input.value = ''
      await ctx.reload()
    }
  }
  block.append(form)
  return block
}

function messageRow(ctx: Ctx, message: Message, kind: 'root' | 'reply'): HTMLElement {
  return h(
    'div',
    { class: `message ${kind}` },
    h('div', {
      class: 'byline',
      text: `${ctx.who(message.author)} · ${ago(message.createdAt)}`,
    }),
    // The trailing reference is machinery, not something anyone wrote to be
    // read — it is stripped here and shown as context by the surface instead.
    h('div', { class: 'message-body', text: stripReferences(message.body) }),
  )
}

/** Remove `nostr:naddr…` tokens a client appended for other apps to resolve. */
export function stripReferences(body: string): string {
  return body.replace(/nostr:naddr1[0-9acdefghjklmnpqrstuvwxyz]+/gi, '').trim()
}
