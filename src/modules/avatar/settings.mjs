/** User settings and the Persona library share one revision-checked document. */
import { parseState, parseIdentity } from '../../core/persona.mjs';
export const AVATAR_NAMESPACE = 'dsh-persona-avatar';
export const CHAT_AVATAR_SIZE = 40;
export function defaultAvatarSettings() {
  return { version: 3, user: { name: '你', avatar: null },
    library: { schemaVersion: 2, personas: [] } };
}
/** Read version 2 without changing identities; writes use version 3 with fixed presentation. */
export function parseAvatarSettings(input) {
  if (!input || ![2, 3].includes(input.version)) throw new TypeError('不支持此配置格式。请先备份，再转换为 version 2 或 3。');
  let library, user;
  try { library = parseState(input.library); user = parseIdentity(input.user); }
  catch (error) {
    if (String(error.message).includes('name')) throw new TypeError('显示名称不能为空，最多 80 个字符。');
    throw new TypeError(`显示配置无效：${error.message}`);
  }
  const result = { version: 3, user, library };
  if (JSON.stringify(result).length > 4_000_000) throw new TypeError('头像配置过大，请减少或压缩图片后再保存。');
  return result;
}
