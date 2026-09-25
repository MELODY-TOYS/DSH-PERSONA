import { createElement, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { PERSONA_LOCALE_NAMESPACE, en, zh, zhTranslate } from '../../locales.mjs';
import { mountPersonaSettings } from '../../components/settings-page.mjs';
import { registerPersonaSettings } from './register-settings.mjs';
import { registerChatAvatars } from './register-chat.mjs';
import { installBrandIcons } from '../../branding/brand.mjs';
import { installDetailBackgroundObserver } from '../../branding/detail-background.mjs';
import { mountPromptSettings } from '../../modules/prompts/settings-view.mjs';
import { registerPromptSettings } from './register-prompts.mjs';
export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.session', 'sessions', 'uiConversation'];

function AvatarConfigPage({ useAvatarSettings, avatarActions, localeService, t }) {
  const state = useAvatarSettings(snapshot => snapshot);
  const localeRevision = useSyncExternalStore(localeService.subscribe, () => localeService.getSnapshot().revision);
  const root = useRef(null), view = useRef(null);
  useLayoutEffect(() => {
    view.current = mountPersonaSettings(root.current, { avatar: avatarActions }, { t });
    view.current.render({ avatar: state });
    return () => { view.current?.dispose(); view.current = null; };
  }, [avatarActions, localeRevision, t]);
  useLayoutEffect(() => { view.current?.render({ avatar: state }); }, [state]);
  return createElement('div', { ref: root });
}

export function PersonaPluginConfig(props) {
  return props.view === 'summary' ? (props.t ?? zhTranslate)('avatarSummary') : createElement(AvatarConfigPage, props);
}

function PromptConfigPage({ usePromptsSettings, promptsActions, localeService, t }) {
  const state = usePromptsSettings(snapshot => snapshot);
  const localeRevision = useSyncExternalStore(localeService.subscribe, () => localeService.getSnapshot().revision);
  const root = useRef(null), view = useRef(null);
  useLayoutEffect(() => {
    view.current = mountPromptSettings(root.current, promptsActions, { t });
    view.current.render(state);
    return () => { view.current?.dispose(); view.current = null; };
  }, [localeRevision, promptsActions, t]);
  useLayoutEffect(() => { view.current?.render(state); }, [state]);
  return createElement('div', { ref: root, className: 'dsp-suite' });
}
export function PromptPluginConfig(props) {
  return props.view === 'summary' ? (props.t ?? zhTranslate)('promptsSummary') : createElement(PromptConfigPage, props);
}

/** The dock stays inside its Session's scrollport, including composer approval overlays. */
export function ConversationAvatars({ connectChat }) {
  const marker = useRef(null);
  useLayoutEffect(() => connectChat(marker.current), [connectChat]);
  return createElement('span', { ref: marker, hidden: true, 'data-dsp-chat-bridge': '' });
}
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(PERSONA_LOCALE_NAMESPACE, { zh, en }), 'dsh-persona: locale dictionaries');
  ctx.effect(() => installBrandIcons(), 'dsh-persona: project icons');
  ctx.effect(() => installDetailBackgroundObserver(), 'dsh-persona: plugin detail backdrop');
  registerPersonaSettings(ctx, PersonaPluginConfig);
  registerPromptSettings(ctx, PromptPluginConfig);
  registerChatAvatars(ctx, ConversationAvatars);
}
