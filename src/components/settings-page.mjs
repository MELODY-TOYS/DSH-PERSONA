/** Bundle-owned component navigation. Each component owns its fields and automatic persistence. */
import { avatarDefinition } from '../modules/avatar/definition.mjs';
import { mountAvatarSettings } from '../modules/avatar/settings-view.mjs';
import { zhTranslate } from '../locales.mjs';
export const settingsComponents = Object.freeze([{ ...avatarDefinition, mountSettings: mountAvatarSettings }]);
const suiteStyles = `.dsp-suite > .dsp-component-nav{display:flex;align-items:center;gap:28px;border-bottom:1px solid var(--dsw-alias-border-l3,#353538);margin-bottom:24px;font-size:13px;color:var(--dsw-alias-label-primary,#ededee)}.dsp-suite > .dsp-component-nav .dsp-component-current{padding:0 0 12px;border-bottom:2px solid currentColor;margin-bottom:-1px}.dsp-suite > .dsp-component-nav button{font:inherit;color:inherit;background:transparent;border:0;padding:0 0 12px;cursor:pointer}.dsp-suite > .dsp-component-nav button:focus-visible{outline:2px solid currentColor;outline-offset:3px}`;
export function mountPersonaSettings(root, actionsByComponent, viewOptions = {}) {
  const t = viewOptions.t ?? zhTranslate;
  root.classList.add('dsp-suite');
  const style = document.createElement('style'); style.textContent = suiteStyles;
  const nav = document.createElement('nav'); nav.className = 'dsp-component-nav'; nav.setAttribute('aria-label', t('componentConfig'));
  const content = document.createElement('div');
  root.replaceChildren(style, ...(settingsComponents.length > 1 ? [nav] : []), content);
  let active = settingsComponents[0], view = null, snapshots = {}, disposed = false;
  function activate(definition) {
    view?.dispose();
    active = definition;
    view = definition.mountSettings(content, actionsByComponent[definition.id], viewOptions);
    for (const item of nav.children) {
      item.classList.toggle('dsp-component-current', item.dataset.component === definition.id);
      if (item.dataset.component) item.setAttribute('aria-current', item.dataset.component === definition.id ? 'page' : 'false');
    }
    if (snapshots[definition.id]) view.render(snapshots[definition.id]);
  }
  for (const definition of settingsComponents) {
    const item = document.createElement(settingsComponents.length > 1 ? 'button' : 'span');
    item.textContent = definition.id === 'avatar' ? t('avatarTitle') : definition.title; item.dataset.component = definition.id;
    if (item.tagName === 'BUTTON') { item.type = 'button'; item.onclick = () => activate(definition); }
    nav.append(item);
  }
  activate(active);
  return {
    render(next) { if (!disposed) { snapshots = next; view?.render(next[active.id]); } },
    dispose() {
      if (disposed) return; disposed = true;
      view?.dispose(); root.replaceChildren(); root.classList.remove('dsp-suite');
    },
  };
}
