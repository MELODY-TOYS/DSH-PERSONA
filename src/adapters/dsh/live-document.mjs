import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * Serve a component's volatile `document` field from its DSH profile entry.
 * The Loader and the configuration editor pass writes through `internal/config`;
 * a rejected document is refused or ignored, and the running value stays unchanged.
 * @returns a reader for the committed section.
 */
export function installLiveDocument(ctx, config, { entryId, legacySection, validate }) {
  ctx.on('internal/config', function (_raw, next) {
    const raw = next();
    if (this === ctx.fiber && raw?.document !== undefined) validate(raw.document);
    return raw;
  });
  ctx.on('loader/volatile-update', () => { ctx.emit('system-prompt/change'); });
  // The browser half renders the configuration page; DSH's generated form would expose the raw JSON.
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
  let disposed = false;
  ctx.effect(() => () => { disposed = true; }, `${entryId}: legacy settings import`);
  void importLegacySection(ctx, { entryId, legacySection, validate, isDisposed: () => disposed });
  return () => ({ document: config.document.get() });
}

const LEGACY_FILES = ['settings.yaml', 'settings.yaml.imported'];

/** Read the DSH 0.1.6 section. DSH 0.1.7 renames the file once, so the renamed copy is read second. */
export async function readLegacySection(home, section) {
  for (const name of LEGACY_FILES) {
    let text;
    try { text = await readFile(join(home, name), 'utf8'); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    const document = parse(text)?.[section]?.document;
    return typeof document === 'string' ? document : undefined;
  }
  return undefined;
}

/**
 * DSH 0.1.7 imports settings.yaml sections only into entries with the same id.
 * The Persona section used another name, so each component copies its own section
 * while the profile entry still has no saved document.
 */
export async function importLegacySection(ctx, { entryId, legacySection, validate, isDisposed }) {
  let settings;
  const form = () => settings.describe().find(row => row.ns === entryId);
  const saved = () => form()?.user?.document !== undefined;
  try {
    await ctx.get('loader')?.await();
    settings = ctx.get('settings');
    const home = ctx.get('profileContext')?.home;
    if (isDisposed() || !settings || typeof home !== 'string' || !form() || saved()) return;
    const document = await readLegacySection(home, legacySection);
    if (document === undefined || isDisposed()) return;
    validate(document);
    const current = form();
    if (!current || saved()) return;
    await settings.update(entryId, { document }, current.revision);
    ctx.logger.info('%s: imported section %s from DSH 0.1.6 settings.yaml', entryId, legacySection);
  } catch (error) {
    // DSH's own import may save the same section first; its revision then refuses this copy.
    try { if (isDisposed() || (settings && saved())) return; } catch { /* Report the original failure. */ }
    ctx.logger.warn('%s: section %s of DSH 0.1.6 settings.yaml was not imported', entryId, legacySection);
    ctx.logger.warn(error);
  }
}
