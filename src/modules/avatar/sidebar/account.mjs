import { AVATAR_NAMESPACE, defaultAvatarSettings, parseAvatarSettings } from '../settings.mjs';
import styles from './account.css';

/**
 * Show the user's Persona picture in the sidebar account launcher.
 * The launcher keeps its own account menu; only the 24px picture is replaced.
 * @param ctx Client context with the Persona settings form.
 * @returns Disposer that restores the host picture and removes the style.
 */
export function installAccountAvatar(ctx) {
  const settings = ctx.configForms.get(AVATAR_NAMESPACE);
  const doc = document, root = doc.documentElement;
  const style = doc.createElement('style');
  style.dataset.dspAccountStyle = '';
  style.textContent = styles;
  doc.head.append(style);
  let lastDocument;
  const clear = () => {
    root.removeAttribute('data-dsp-account-avatar');
    root.style.removeProperty('--dsp-account-avatar');
  };
  const apply = () => {
    const snapshot = settings.getSnapshot();
    if (snapshot.status !== 'ready') { lastDocument = undefined; clear(); return; }
    const documentText = snapshot.value?.document;
    if (documentText === lastDocument) return;
    lastDocument = documentText;
    try {
      const config = parseAvatarSettings(documentText === undefined ? defaultAvatarSettings() : JSON.parse(documentText));
      const avatar = config.user.avatar;
      if (!avatar) { clear(); return; }
      root.setAttribute('data-dsp-account-avatar', '');
      root.style.setProperty('--dsp-account-avatar', `url("${avatar}")`);
    } catch { clear(); }
  };
  const off = settings.subscribe(apply);
  apply();
  return () => { off(); clear(); style.remove(); };
}
