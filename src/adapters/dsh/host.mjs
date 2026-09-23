import z from '@deepseek-ai/schemastery';
import { AVATAR_NAMESPACE, defaultAvatarSettings, parseAvatarSettings } from '../../modules/avatar/settings.mjs';
import { createPersonaService } from '../../core/persona-service.mjs';

export const name = 'dsh-persona';
export const inject = ['settings'];
export const AvatarConfig = z.object({ document: z.string().default(JSON.stringify(defaultAvatarSettings())) });
export const Config = z.object({});
export function apply(ctx) {
  let source = () => ({ document: JSON.stringify(defaultAvatarSettings()) });
  ctx.settings.installSection(ctx, AVATAR_NAMESPACE, AvatarConfig, {}, {
    validate: value => {
      if (typeof value.document !== 'string' || value.document.length > 4_000_000) throw new TypeError('头像组件配置文档格式不正确或过大。');
      parseAvatarSettings(JSON.parse(value.document));
    },
    setSource: current => { source = current; },
    onChange: () => { ctx.emit('system-prompt/change'); },
  });
  const service = createPersonaService(() => source());
  ctx.provide('dshPersona', service);
}
