import z from '@deepseek-ai/schemastery';
import { AVATAR_DOCUMENT_LIMIT, AVATAR_LEGACY_SECTION, AVATAR_NAMESPACE, defaultAvatarSettings, parseAvatarSettings } from '../../modules/avatar/settings.mjs';
import { createPersonaService } from '../../core/persona-service.mjs';
import { installLiveDocument } from './live-document.mjs';

export const name = 'dsh-persona';
export const Config = z.object({
  document: z.string().default(JSON.stringify(defaultAvatarSettings())).volatile(),
});

function validateAvatarDocument(document) {
  if (typeof document !== 'string' || document.length > AVATAR_DOCUMENT_LIMIT) throw new TypeError('头像组件配置文档格式不正确或过大。');
  parseAvatarSettings(JSON.parse(document));
}

export function apply(ctx, config) {
  const source = installLiveDocument(ctx, config, {
    entryId: AVATAR_NAMESPACE, legacySection: AVATAR_LEGACY_SECTION, validate: validateAvatarDocument,
  });
  ctx.provide('dshPersona', createPersonaService(source));
}
