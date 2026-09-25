import { bindComponentSettings } from './settings-scope.mjs';
import { PromptSettingsController } from '../../modules/prompts/config-controller.mjs';
import { PROMPTS_NAMESPACE, PROMPTS_ROW_ID } from '../../modules/prompts/settings.mjs';
import { AVATAR_NAMESPACE } from '../../modules/avatar/settings.mjs';
import { PERSONA_LOCALE_NAMESPACE } from '../../locales.mjs';

/** The package's browser half renders the Host-only prompts row's configuration. */
export function registerPromptSettings(ctx, Component) {
  const controller = new PromptSettingsController(
    bindComponentSettings(ctx, PROMPTS_NAMESPACE),
    ctx.configForms.get(AVATAR_NAMESPACE),
    () => ctx.remote.session.modelCatalog(),
  );
  ctx.effect(() => () => controller.dispose(), 'dsh-persona: prompt settings');
  ctx.effect(() => ctx.remote.$on('llm/adapters-updated', () => { void controller.refreshCatalog(); }), 'dsh-persona: prompt model catalog');
  ctx.effect(() => ctx.remote.$on('settings/document-updated', () => { void controller.refreshCatalog(); }), 'dsh-persona: prompt settings catalog');
  ctx.effect(() => ctx.on('connection/reset', () => { void controller.refreshCatalog(); }), 'dsh-persona: prompt reconnect');
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config', key: `dsh-persona#${PROMPTS_ROW_ID}`,
    locale: PERSONA_LOCALE_NAMESPACE,
    inject: () => ({ hooks: { promptsSettings: controller }, promptsActions: controller, localeService: ctx.locale }),
  }, Component));
  void controller.refreshCatalog();
  return controller;
}
