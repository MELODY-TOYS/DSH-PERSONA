import { bindComponentSettings } from './settings-scope.mjs';
import { AvatarSettingsController } from '../../modules/avatar/config-controller.mjs';
import { AVATAR_NAMESPACE } from '../../modules/avatar/settings.mjs';
import { avatarDefinition } from '../../modules/avatar/definition.mjs';
import { PERSONA_LOCALE_NAMESPACE } from '../../locales.mjs';

/** Bind Persona settings to its native bundle row. The bundle page itself only lists components. */
export function registerPersonaSettings(ctx, Component) {
  const controller = new AvatarSettingsController(
    bindComponentSettings(ctx, AVATAR_NAMESPACE),
    () => ctx.remote.session.modelCatalog(),
  );
  ctx.effect(() => () => controller.dispose(), 'dsh-persona: avatar settings controller');
  ctx.effect(() => ctx.remote.$on('llm/adapters-updated', () => { void controller.refreshCatalog(); }), 'dsh-persona: adapter catalog');
  ctx.effect(() => ctx.remote.$on('settings/document-updated', () => { void controller.refreshCatalog(); }), 'dsh-persona: settings catalog');
  ctx.effect(() => ctx.on('connection/reset', () => { void controller.refreshCatalog(); }), 'dsh-persona: reconnect');
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config', key: `dsh-persona#${avatarDefinition.rowId}`,
    locale: PERSONA_LOCALE_NAMESPACE,
    inject: () => ({ hooks: { avatarSettings: controller }, avatarActions: controller, localeService: ctx.locale }),
  }, Component));
  void controller.refreshCatalog();
  return controller;
}
