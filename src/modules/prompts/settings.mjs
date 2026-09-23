import { modelKey, parseModel } from '../../core/persona.mjs';

export const PROMPTS_NAMESPACE = 'dsh-persona-prompts';
export const PROMPTS_ROW_ID = 'dsh-persona-prompts';
export const PROMPT_TEXT_LIMIT = 64_000;
export const PROMPTS_TEXT_LIMIT = 256_000;
export const PROMPTS_DOCUMENT_LIMIT = 1_000_000;
export const PROMPTS_RULE_LIMIT = 128;
export const TARGET_LIMIT = 512;
export const defaultPromptSettings = () => ({ version: 1, rules: [] });

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${label}不能为空，最多 ${max} 个字符。`);
  }
  return value;
}
export function parseTarget(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('请选择 Persona 或原生模型。');
  if (input.kind === 'persona') return { kind: 'persona', personaId: text(input.personaId, 'Persona ID', 128).trim() };
  if (input.kind === 'model') return { kind: 'model', ...parseModel(input) };
  throw new TypeError('不支持此目标类型。');
}
export function targetKey(input) {
  const target = parseTarget(input);
  return target.kind === 'persona' ? JSON.stringify(['persona', target.personaId]) : JSON.stringify(['model', target.provider, target.model]);
}
export function parsePromptSettings(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.rules) || input.rules.length > PROMPTS_RULE_LIMIT) {
    throw new TypeError('提示词配置格式无效。');
  }
  const ids = new Set(); let total = 0;
  const rules = input.rules.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new TypeError('提示词条目格式无效。');
    const id = text(rule.id, '提示词 ID', 128).trim();
    if (ids.has(id)) throw new TypeError('提示词 ID 重复。');
    ids.add(id);
    const name = text(rule.name, '名称', 80).trim();
    const prompt = text(rule.prompt, '提示词', PROMPT_TEXT_LIMIT);
    total += prompt.length;
    if (!Array.isArray(rule.targets) || !rule.targets.length || rule.targets.length > TARGET_LIMIT) throw new TypeError('请至少选择一个应用目标，最多 512 个。');
    const targets = rule.targets.map(parseTarget), keys = new Set();
    for (const target of targets) {
      const key = targetKey(target);
      if (keys.has(key)) throw new TypeError('应用目标重复。');
      keys.add(key);
    }
    return { id, name, prompt, targets };
  });
  if (total > PROMPTS_TEXT_LIMIT) throw new TypeError('提示词总长度不能超过 256000 个字符。');
  const result = { version: 1, rules };
  if (JSON.stringify(result).length > PROMPTS_DOCUMENT_LIMIT) throw new TypeError('提示词配置过大。');
  return result;
}
export function readPromptDocument(section) {
  if (typeof section?.document !== 'string' || section.document.length > PROMPTS_DOCUMENT_LIMIT) throw new TypeError('提示词配置文档无效。');
  return parsePromptSettings(JSON.parse(section.document));
}

/** OR within a rule, append across rules. A stable Persona ID follows its current saved members. */
export function matchingPromptRules(settings, library, model) {
  const route = modelKey(model);
  const memberships = new Set(library.personas.filter(p => p.models.some(m => modelKey(m) === route)).map(p => p.id));
  return settings.rules.filter(rule => rule.targets.some(target => target.kind === 'persona'
    ? memberships.has(target.personaId) : modelKey(target) === route));
}
