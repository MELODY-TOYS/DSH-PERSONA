import z from '@deepseek-ai/schemastery';
import { defaultPromptSettings, PROMPTS_NAMESPACE, readPromptDocument } from './settings.mjs';
import { installPromptInjection } from './runtime.mjs';

export const name = 'dsh-persona-prompts';
export const inject = ['settings', 'systemPrompt', 'dshPersona'];
export const Config = z.object({});
export const PromptConfig = z.object({ document: z.string().default(JSON.stringify(defaultPromptSettings())) });

export function apply(ctx) {
  let source = () => ({ document: JSON.stringify(defaultPromptSettings()) });
  ctx.settings.installSection(ctx, PROMPTS_NAMESPACE, PromptConfig, {}, {
    validate: value => { readPromptDocument(value); },
    setSource: current => { source = current; },
    onChange: () => { ctx.emit('system-prompt/change'); },
  });
  ctx.effect(() => installPromptInjection(ctx, () => source()), 'dsh-persona: model prompts');
}
