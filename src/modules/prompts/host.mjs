import z from '@deepseek-ai/schemastery';
import { defaultPromptSettings, PROMPTS_NAMESPACE, readPromptDocument } from './settings.mjs';
import { installPromptInjection } from './runtime.mjs';
import { installLiveDocument } from '../../adapters/dsh/live-document.mjs';

export const name = 'dsh-persona-prompts';
export const inject = ['systemPrompt', 'dshPersona'];
export const Config = z.object({
  document: z.string().default(JSON.stringify(defaultPromptSettings())).volatile(),
});

export function apply(ctx, config) {
  const source = installLiveDocument(ctx, config, {
    entryId: PROMPTS_NAMESPACE, legacySection: PROMPTS_NAMESPACE,
    validate: document => { readPromptDocument({ document }); },
  });
  ctx.effect(() => installPromptInjection(ctx, source), 'dsh-persona: model prompts');
}
