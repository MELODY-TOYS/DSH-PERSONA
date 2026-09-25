import { AVATAR_NAMESPACE } from '../../modules/avatar/settings.mjs';
import { decorateChat } from '../../modules/avatar/chat/decorate.mjs';
import { MODEL_TARGET, modelHeaderDefinition, createModelHistory } from './model-history.mjs';

/** Register a read-only model-history target and one lifecycle mount per conversation. */
export function registerChatAvatars(ctx, Component) {
  ctx.uiConversation.events.register(modelHeaderDefinition);
  ctx.uiConversation.views.register({ target: MODEL_TARGET, create: createModelHistory, isActive: () => false });
  const settings = ctx.configForms.get(AVATAR_NAMESPACE);
  const mounts = new Set();
  ctx.effect(() => () => { for (const off of mounts) off(); mounts.clear(); }, 'dsh-persona: chat avatars');
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'dsh-persona-avatars', order: 100,
    inject: sessionId => ({
      connectChat(marker) {
        const root = marker?.closest?.('[data-conversation-scroll]');
        const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId);
        if (!root || !binding) return () => {};
        const conversation = ctx.uiConversation.binding(binding);
        const stop = decorateChat(root, { settings,
          chat: conversation.target('chat'), models: conversation.target(MODEL_TARGET) });
        const off = () => { mounts.delete(off); stop(); };
        mounts.add(off); return off;
      },
    }),
  }, Component));
}
