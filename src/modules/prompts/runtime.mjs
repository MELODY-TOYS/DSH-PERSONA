import { matchingPromptRules, readPromptDocument } from './settings.mjs';

/** Run outside the model-selection waterfall so its captured provider/model have already resolved. */
export function installPromptInjection(ctx, readSection) {
  let disposed = false, document, settings;
  const read = () => {
    const section = readSection();
    if (!settings || document !== section.document) {
      settings = readPromptDocument(section); document = section.document;
    }
    return settings;
  };
  const off = ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    if (!context.agent || disposed || context.signal?.aborted) return next();
    // Capture committed configuration together before asynchronous downstream assembly.
    const rules = read(), library = ctx.dshPersona.getSnapshot().library;
    const assembled = await next();
    if (disposed || context.signal?.aborted) return assembled;
    const { provider, model } = assembled.variables;
    if (typeof provider !== 'string' || !provider.trim() || typeof model !== 'string' || !model.trim()) return assembled;
    const matched = matchingPromptRules(rules, library, { provider, model });
    if (!matched.length) return assembled;
    const sections = matched.map(rule => ({
      name: `dsh-persona:prompt:${rule.id}`,
      text: rule.prompt,
      interpolate: false,
    }));
    // DSH restores a complete:true prompt after this waterfall; that host contract still wins.
    const owned = new Set(sections.map(section => section.name));
    return { ...assembled, sections: [...assembled.sections.filter(section => !owned.has(section.name)), ...sections] };
  }, { prepend: true });
  ctx.emit('system-prompt/change');
  return () => {
    if (disposed) return;
    disposed = true; off(); ctx.emit('system-prompt/change');
  };
}
