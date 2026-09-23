import { PROMPTS_NAMESPACE, PROMPTS_ROW_ID } from './settings.mjs';
export const promptsDefinition = Object.freeze({
  id: 'prompts', rowId: PROMPTS_ROW_ID, title: '提示词', apiVersion: 1, configVersion: 1,
  namespace: PROMPTS_NAMESPACE, status: 'available',
  summary: '为 Persona 组或原生模型追加提示词。',
});
