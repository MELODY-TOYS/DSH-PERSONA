import { modelKey } from '../../core/persona.mjs';
import { createAvatar } from './index.mjs';
import sharedStyles from '../../components/settings-shell.css';
import { bindDialogKeyboard } from '../../components/settings-dialogs.mjs';
import { selectionMotion } from '../../components/settings-motion.mjs';
import { identityRenderer, mountChatPreview } from './chat-preview.mjs';
import avatarStyles from './settings.css';
import previewStyles from './chat-preview.css';
import { choosePreviewScenario } from './preview-copy.mjs';
import { zhTranslate } from '../../locales.mjs';

const template = t => `
<form class="dsp-form" novalidate>
  <div class="dsp-loading" role="status">${t('loadingConfig')}</div>
  <div class="dsp-content" hidden>
    <fieldset class="dsp-editable">
      <section class="dsp-user-settings" aria-labelledby="dsp-user-heading">
        <h3 id="dsp-user-heading">${t('user')}</h3>
        <div class="dsp-user-fields">
          <div class="dsp-avatar-editor"><span data-avatar="user"></span><div class="dsp-avatar-actions"><button type="button" data-upload="user" aria-label="${t('changeUserAvatar')}" title="${t('imageRequirements')}">${t('changeAvatar')}</button><button type="button" data-remove="user" aria-label="${t('removeUserAvatar')}" class="dsp-text-button" hidden>${t('remove')}</button></div></div>
          <label class="dsp-field"><span>${t('displayName')}</span><input data-control="userName" aria-label="${t('userDisplayName')}" aria-describedby="dsp-user-error" maxlength="80" autocomplete="off"><span class="dsp-field-error" id="dsp-user-error" hidden></span></label>
        </div>
      </section>
      <section class="dsp-ai-settings" aria-labelledby="dsp-ai-heading">
        <div class="dsp-section-heading"><h3 id="dsp-ai-heading">${t('aiPersona')} <span class="dsp-persona-count dsp-hint"></span></h3><button type="button" data-action="new">${t('newPersona')}</button></div>
        <div class="dsp-no-personas"><p>${t('noPersonas')}</p><p class="dsp-hint">${t('noPersonasHint')}</p></div>
        <div class="dsp-persona-workspace dsp-settings-workspace" hidden>
          <nav class="dsp-persona-list dsp-settings-list" aria-label="${t('personaList')}"></nav>
          <div class="dsp-persona-editor dsp-settings-editor">
            <div class="dsp-ai-identity">
              <div class="dsp-avatar-editor"><span data-avatar="assistant"></span><div class="dsp-avatar-actions"><button type="button" data-upload="assistant" aria-label="${t('changePersonaAvatar')}" title="${t('imageRequirements')}">${t('changeAvatar')}</button><button type="button" data-remove="assistant" aria-label="${t('removePersonaAvatar')}" class="dsp-text-button" hidden>${t('remove')}</button></div></div>
              <label class="dsp-field"><span>${t('displayName')}</span><input data-control="name" aria-label="${t('personaDisplayName')}" aria-describedby="dsp-name-error" maxlength="80" autocomplete="off"><span class="dsp-field-error" id="dsp-name-error" hidden></span></label>
            </div>
            <section class="dsp-preview-section" aria-labelledby="dsp-preview-heading">
              <h4 id="dsp-preview-heading">${t('messagePreview')}</h4>
              <div class="dsp-chat-preview" role="group" aria-label="${t('messagePreview')}"><div class="dsp-preview-messages"></div></div>
            </section>
            <section class="dsp-model-section" aria-labelledby="dsp-model-heading">
              <div class="dsp-section-heading"><h4 id="dsp-model-heading">${t('linkedModels')}</h4><span class="dsp-model-count dsp-hint"></span></div>
              <p class="dsp-hint">${t('linkedModelsHint')}</p>
              <div class="dsp-model-tools"><label class="dsp-field dsp-search"><span class="dsp-sr-only">${t('searchModels')}</span><input type="search" data-control="search" placeholder="${t('searchModelsPlaceholder')}"></label><button type="button" data-action="selectAll" class="dsp-text-button" title="${t('selectAllModelsTitle')}">${t('selectAll')}</button><button type="button" data-action="clearModels" class="dsp-text-button">${t('clearLinks')}</button></div>
              <fieldset class="dsp-models" aria-labelledby="dsp-model-heading"><div class="dsp-model-list"></div></fieldset>
              <div class="dsp-catalog-status dsp-hint" role="status" hidden></div><button type="button" class="dsp-text-button dsp-retry" data-action="retry" hidden>${t('retry')}</button>
            </section>
            <div class="dsp-persona-footer"><button type="button" class="dsp-text-button dsp-delete" data-action="delete">${t('deletePersona')}</button></div>
          </div>
        </div>
      </section>
      <div class="dsp-empty-preview"></div>
    </fieldset>
    <div class="dsp-save-footer">
      <p class="dsp-validation" role="alert" hidden></p>
      <div class="dsp-conflict" role="alert" hidden>${t('settingsConflict')}<button type="button" class="dsp-text-button" data-action="reload">${t('discardAndReload')}</button></div>
      <div class="dsp-save-row"><span class="dsp-save-status dsp-hint" role="status">${t('changesAutoSave')}</span><button type="button" class="dsp-text-button dsp-save-retry" data-action="retrySave" hidden>${t('retryAutoSave')}</button></div>
    </div>
  </div>
  <p class="dsp-read-error" role="alert" hidden></p>
</form>
<input type="file" class="dsp-file" accept="image/png,image/jpeg,image/webp" hidden>
<dialog class="dsp-crop-dialog" aria-labelledby="dsp-crop-title"><h3 id="dsp-crop-title">${t('cropAvatar')}</h3><canvas width="256" height="256" aria-label="${t('cropPreview')}"></canvas><label class="dsp-crop-slider">${t('zoom')}<input type="range" data-crop="zoom" min="1" max="4" step="0.05" value="1"></label><label class="dsp-crop-slider">${t('horizontalPosition')}<input type="range" data-crop="x" min="0" max="1" step="0.01" value="0.5"></label><label class="dsp-crop-slider">${t('verticalPosition')}<input type="range" data-crop="y" min="0" max="1" step="0.01" value="0.5"></label><div class="dsp-dialog-actions"><button type="button" data-action="cropCancel">${t('cancel')}</button><button type="button" data-action="cropApply">${t('useAvatar')}</button></div></dialog>
<dialog class="dsp-delete-dialog" aria-labelledby="dsp-delete-title"><h3 id="dsp-delete-title">${t('deletePersonaQuestion')}</h3><p class="dsp-delete-detail dsp-hint"></p><div class="dsp-dialog-actions"><button type="button" data-action="deleteCancel" autofocus>${t('cancel')}</button><button type="button" data-action="deleteApply">${t('delete')}</button></div></dialog>
<dialog class="dsp-move-dialog" aria-labelledby="dsp-move-title"><h3 id="dsp-move-title">${t('moveModelLinksQuestion')}</h3><p class="dsp-move-detail dsp-hint"></p><div class="dsp-dialog-actions"><button type="button" data-action="moveCancel" autofocus>${t('cancel')}</button><button type="button" data-action="moveApply">${t('move')}</button></div></dialog>`;

const text = (tag, value, className = '') => { const n = document.createElement(tag); n.textContent = value; n.className = className; return n; };
const safeIdentity = (i, t) => ({ name: i.name.trim() || t('unnamed'), avatar: i.avatar });

/** Component-owned fields; the native Slot and local preview mount this same implementation. */
export function mountAvatarSettings(root, actions, { t = zhTranslate } = {}) {
  const abort = new AbortController();
  const previewScenario = choosePreviewScenario();
  bindDialogKeyboard(root, abort.signal);
  const style = document.createElement('style'); style.textContent = sharedStyles + '\n' + avatarStyles + '\n' + previewStyles;
  root.classList.add('dsh-persona-settings'); root.innerHTML = template(t); root.prepend(style);
  const $ = s => root.querySelector(s), field = k => $(`[data-control="${k}"]`);
  const on = (node, event, fn) => node.addEventListener(event, fn, { signal: abort.signal });
  const renderIdentity = identityRenderer();
  const preview = mountChatPreview($('.dsp-chat-preview'), previewScenario, abort.signal);
  const previewSection = $('.dsp-preview-section');
  const animateSelection = selectionMotion($('.dsp-persona-editor'), abort.signal);
  let current, filter = '', modelsSignature = '', listSignature = '';
  let moveFocusKey = null;
  const matchingCandidates = () => {
    const query = filter.toLocaleLowerCase().trim();
    return (current?.candidates ?? []).filter(r => !query || `${r.providerName} ${r.modelName} ${r.provider} ${r.model}`.toLocaleLowerCase().includes(query));
  };
  let disposed = false, uploadGeneration = 0, cropImage = null, cropOwner = null, returnFocus = null, moveRequest = null, deleteId = null;
  const selected = c => c.library.personas.find(p => p.id === current?.selectedId);
  const setField = (k, value) => { if (field(k).value !== String(value)) field(k).value = value; };
  const localError = value => { $('.dsp-validation').textContent = value; $('.dsp-validation').hidden = !value; };
  function editPersona(change, id = current?.selectedId) {
    actions.edit(c => { const p = c.library.personas.find(p => p.id === id); if (p) { change(p, c); p.revision++; } });
  }
  function applyIdentity(target, patch, id = current?.selectedId) {
    if (target === 'user') actions.edit(c => { c.user = { ...c.user, ...patch }; });
    else editPersona(p => { Object.assign(p, patch); }, id);
  }
  function stageRoutes(routes, id, confirmed = false) {
    const keys = new Set(routes.map(modelKey));
    const library = current.value.library, target = library.personas.find(p => p.id === id);
    if (!target) return;
    const conflicts = library.personas.filter(p => p.id !== id && p.models.some(m => keys.has(modelKey(m))));
    if (conflicts.length && !confirmed) {
      moveRequest = { routes: structuredClone(routes), id };
      const count = conflicts.reduce((total, p) => total + p.models.filter(m => keys.has(modelKey(m))).length, 0);
      const sources = conflicts.map(p => t('quotedName', { name: p.name || t('unnamedPersona') })).join(t('listSeparator'));
      $('.dsp-move-detail').textContent = t('moveModelLinks', { count, sources, target: target.name || t('unnamedPersona') });
      moveFocusKey = document.activeElement?.dataset.route ?? null;
      $('.dsp-move-dialog').showModal();
      modelsSignature = ''; render(current); // Undo the native checkbox until confirmation.
      return;
    }
    actions.edit(c => {
      const destination = c.library.personas.find(p => p.id === id); if (!destination) return;
      for (const p of c.library.personas) {
        if (p.id !== id) {
          const before = p.models.length; p.models = p.models.filter(m => !keys.has(modelKey(m)));
          if (before !== p.models.length) p.revision++;
        }
      }
      destination.models = [...new Map([...destination.models, ...routes].map(m => [modelKey(m), { provider: m.provider, model: m.model }])).values()];
      destination.revision++;
    });
  }
  on(root, 'input', e => {
    const k = e.target.dataset.control;
    if (k === 'name') applyIdentity('assistant', { name: e.target.value });
    if (k === 'userName') applyIdentity('user', { name: e.target.value });
    if (k === 'search') { filter = e.target.value; modelsSignature = ''; render(current); }
  });
  on(root, 'change', e => {
    const k = e.target.dataset.control;
    const key = e.target.dataset.route;
    if (key) {
      const row = current.candidates.find(r => r.key === key); if (!row) return;
      if (e.target.checked) stageRoutes([{ provider: row.provider, model: row.model }], current.selectedId);
      else editPersona(p => { p.models = p.models.filter(m => modelKey(m) !== key); });
    }
  });
  on($('.dsp-form'), 'submit', e => { e.preventDefault(); });
  on(root, 'click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.persona) { filter = ''; field('search').value = ''; actions.select(button.dataset.persona); return; }
    if (button.dataset.upload) {
      cropOwner = { target: button.dataset.upload, id: current.selectedId }; returnFocus = button; $('.dsp-file').click(); return;
    }
    if (button.dataset.remove) { applyIdentity(button.dataset.remove, { avatar: null }); return; }
    switch (button.dataset.action) {
      case 'new': {
        filter = ''; field('search').value = '';
        const id = `persona-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        actions.edit(c => { c.library.personas.push({ id, revision: 1, name: '', avatar: null, models: [] }); });
        actions.select(id); field('name').focus(); break;
      }
      case 'selectAll': stageRoutes(matchingCandidates().filter(r => r.available).map(r => ({ provider: r.provider, model: r.model })), current.selectedId); break;
      case 'clearModels': editPersona(p => { p.models = []; }); break;
      case 'retry': void actions.refreshCatalog(); break;
      case 'retrySave': void actions.save(); break;
      case 'reload': actions.discard(); break;
      case 'delete': {
        deleteId = current.selectedId;
        const p = selected(current.value);
        $('.dsp-delete-detail').textContent = t(p.models.length ? 'deletePersonaWithModels' : 'deletePersonaWithoutModels', {
          name: p.name || t('unnamedPersona'),
        });
        $('.dsp-delete-dialog').showModal(); break;
      }
      case 'deleteCancel': $('.dsp-delete-dialog').close(); break;
      case 'deleteApply': actions.edit(c => { c.library.personas = c.library.personas.filter(p => p.id !== deleteId); }); $('.dsp-delete-dialog').close(); $('[data-action="new"]').focus(); break;
      case 'moveCancel': moveRequest = null; $('.dsp-move-dialog').close(); break;
      case 'moveApply': if (moveRequest) { const request = moveRequest; moveRequest = null; stageRoutes(request.routes, request.id, true); } $('.dsp-move-dialog').close(); break;
      case 'cropCancel': $('.dsp-crop-dialog').close(); break;
      case 'cropApply': if (cropImage && cropOwner) { applyIdentity(cropOwner.target, { avatar: $('canvas').toDataURL('image/webp', 0.88) }, cropOwner.id); $('.dsp-crop-dialog').close(); } break;
    }
  });
  function drawCrop() {
    if (!cropImage) return;
    const canvas = $('canvas'), ctx = canvas.getContext('2d');
    const side = Math.min(cropImage.width, cropImage.height) / Number($('[data-crop="zoom"]').value);
    const x = (cropImage.width - side) * Number($('[data-crop="x"]').value), y = (cropImage.height - side) * Number($('[data-crop="y"]').value);
    ctx.clearRect(0, 0, 256, 256); ctx.drawImage(cropImage, x, y, side, side, 0, 0, 256, 256);
  }
  on($('.dsp-move-dialog'), 'close', () => {
    moveRequest = null;
    if (!disposed && moveFocusKey) [...root.querySelectorAll('[data-route]')].find(node => node.dataset.route === moveFocusKey)?.focus({ preventScroll: true });
    moveFocusKey = null;
  });
  for (const slider of root.querySelectorAll('[data-crop]')) on(slider, 'input', drawCrop);
  on($('.dsp-crop-dialog'), 'close', () => { cropImage?.close?.(); cropImage = null; if (!disposed) returnFocus?.focus(); });
  on($('.dsp-file'), 'change', async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file || !cropOwner) return;
    const generation = ++uploadGeneration;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { localError(t('invalidImage')); return; }
    try {
      let image;
      if (typeof createImageBitmap === 'function') image = await createImageBitmap(file);
      else { const url = URL.createObjectURL(file); try { image = new Image(); image.src = url; await image.decode(); } finally { URL.revokeObjectURL(url); } }
      if (disposed || generation !== uploadGeneration) { image.close?.(); return; }
      if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > 24_000_000) { image.close?.(); throw new Error('图片尺寸过大'); }
      cropImage?.close?.(); cropImage = image;
      $('[data-crop="zoom"]').value = '1'; $('[data-crop="x"]').value = '0.5'; $('[data-crop="y"]').value = '0.5';
      drawCrop(); $('.dsp-crop-dialog').showModal();
    } catch { if (!disposed) localError(t('unreadableImage')); }
  });
  function renderList(c) {
    const signature = JSON.stringify(c.library.personas.map(p => [p.id, p.name, p.avatar, p.models.length]));
    if (signature !== listSignature) {
      listSignature = signature; const nav = $('.dsp-persona-list'), activeId = document.activeElement?.dataset.persona;
      nav.replaceChildren();
      for (const p of c.library.personas) {
        const button = text('button', '', 'dsp-persona-item'); button.type = 'button'; button.dataset.persona = p.id;
        const copy = text('span', '', 'dsp-persona-item-copy'); copy.append(text('strong', p.name || t('unnamedPersona')), text('small', t('personaModelCount', { count: p.models.length }), 'dsp-hint'));
        button.append(createAvatar(safeIdentity(p, t)), copy); nav.append(button);
      }
      if (activeId) [...nav.children].find(n => n.dataset.persona === activeId)?.focus({ preventScroll: true });
    }
    for (const n of $('.dsp-persona-list').children) { const active = n.dataset.persona === current.selectedId; n.classList.toggle('is-selected', active); n.setAttribute('aria-current', active ? 'true' : 'false'); }
  }
  function renderModels(c, p) {
    const signature = JSON.stringify([current.candidates, c.library.personas.map(item => [item.id, item.id === p.id ? null : item.name, item.models]), p.id, filter]);
    if (signature === modelsSignature) return; modelsSignature = signature;
    const list = $('.dsp-model-list'), box = $('.dsp-models'), scroll = box.scrollTop, focusKey = document.activeElement?.dataset.route;
    list.replaceChildren();
    const keys = new Set(p.models.map(modelKey)), owners = new Map();
    for (const persona of c.library.personas) for (const m of persona.models) owners.set(modelKey(m), persona);
    const grouped = new Map();
    const rows = matchingCandidates();
    for (const row of rows) { const key = row.available ? row.provider : '__unavailable'; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); }
    for (const group of grouped.values()) {
      const providerName = group[0].available ? group[0].providerName : t('unavailableNow');
      const section = text('section', '', 'dsp-model-group'); section.append(text('h4', providerName, 'dsp-provider'));
      for (const row of group) {
        const wrap = text('div', '', 'dsp-model-row'), label = text('label', '', 'dsp-model-label'), check = document.createElement('input');
        check.type = 'checkbox'; check.dataset.route = row.key; check.checked = keys.has(row.key); check.setAttribute('aria-label', t('linkModel', { provider: row.available ? row.providerName : t('unavailableNow'), model: row.modelName }));
        const copy = text('span', '', 'dsp-model-copy'); copy.append(text('span', row.modelName, 'dsp-model-name'), text('small', `${row.provider} / ${row.model}`, 'dsp-route')); label.append(check, copy); wrap.append(label);
        const owner = owners.get(row.key);
        if (owner && owner.id !== p.id) { const name = owner.name || t('unnamedPersona'); const badge = text('small', name, 'dsp-model-owner'); badge.title = t('linkedToPersona', { name }); wrap.append(badge); }
        section.append(wrap);
      }
      list.append(section);
    }
    if (!rows.length) list.append(text('p', t(filter ? 'noMatchingModels' : current.catalogStatus === 'loading' ? 'loadingModels' : 'noModels'), 'dsp-hint dsp-empty'));
    box.scrollTop = scroll;
    if (focusKey) [...list.querySelectorAll('input')].find(n => n.dataset.route === focusKey)?.focus({ preventScroll: true });
  }
  function render(snapshot) {
    if (disposed || !snapshot) return; current = snapshot;
    $('.dsp-loading').hidden = snapshot.available || Boolean(snapshot.error);
    $('.dsp-content').hidden = !snapshot.available;
    $('.dsp-read-error').hidden = snapshot.available || !snapshot.error; $('.dsp-read-error').textContent = snapshot.error;
    if (!snapshot.available) animateSelection(null);
    if (!snapshot.value) return;
    const c = snapshot.value, p = selected(c);
    $('.dsp-editable').disabled = !snapshot.writable;
    setField('userName', c.user.name);
    renderIdentity($('[data-avatar="user"]'), safeIdentity(c.user, t), 'user', 'large');
    $('.dsp-persona-count').textContent = String(c.library.personas.length);
    $('[data-remove="user"]').hidden = !c.user.avatar;
    $('.dsp-no-personas').hidden = !!p; $('.dsp-persona-workspace').hidden = !p;
    $('[data-action="new"]').disabled = !snapshot.writable || c.library.personas.length >= 128;
    renderList(c);
    if (p) {
      setField('name', p.name); renderIdentity($('[data-avatar="assistant"]'), safeIdentity(p, t), 'assistant', 'large');
      $('[data-remove="assistant"]').hidden = !p.avatar;
      $('.dsp-model-count').textContent = t('selectedModels', { count: p.models.length });
      renderModels(c, p);
      $('.dsp-catalog-status').textContent = snapshot.catalogError || (snapshot.catalogPartial ? t('partialCatalog') : snapshot.catalogStatus === 'loading' ? t('loadingModels') : '');
      $('.dsp-catalog-status').hidden = !$('.dsp-catalog-status').textContent;
      $('.dsp-retry').hidden = snapshot.catalogStatus !== 'error' && !snapshot.catalogPartial;
      $('[data-action="selectAll"]').textContent = t(filter.trim() ? 'selectAllResults' : 'selectAll');
      $('[data-action="selectAll"]').title = t(filter.trim() ? 'selectAllResultsTitle' : 'selectAllModelsTitle');
      $('[data-action="selectAll"]').disabled = !snapshot.writable || !matchingCandidates().some(r => r.available);
      $('[data-action="clearModels"]').disabled = !snapshot.writable || !p.models.length;
    }
    const previewParent = p ? $('.dsp-persona-editor') : $('.dsp-empty-preview');
    const previewBefore = p ? $('.dsp-persona-footer') : null;
    if (previewSection.parentElement !== previewParent || previewSection.nextElementSibling !== previewBefore) previewParent.insertBefore(previewSection, previewBefore);
    preview.update(c.user, p);
    if (snapshot.available) animateSelection(p?.id ?? null);
    const invalidUser = !c.user.name.trim(), invalidName = !!p && !p.name.trim();
    for (const [key, selector, invalid] of [['userName', '#dsp-user-error', invalidUser], ['name', '#dsp-name-error', invalidName]]) {
      field(key).setAttribute('aria-invalid', String(invalid));
      $(selector).hidden = !invalid; $(selector).textContent = invalid ? t('displayNameRequired') : '';
    }
    const otherEmpty = c.library.personas.some(persona => persona.id !== p?.id && !persona.name.trim());
    localError(snapshot.error || (otherEmpty ? t('unnamedPersonaError') : invalidUser || invalidName ? '' : snapshot.validationError));
    $('.dsp-conflict').hidden = !snapshot.conflicted;
    $('.dsp-save-retry').hidden = !snapshot.error || !snapshot.dirty || !snapshot.writable || snapshot.saving || snapshot.conflicted;
    $('.dsp-save-status').textContent = snapshot.conflicted ? '' : snapshot.saving ? t('autoSaving') : snapshot.saved ? t('autoSaved')
      : snapshot.dirty && snapshot.validationError ? t('fixBeforeAutoSave') : snapshot.dirty && !snapshot.error ? t('autoSaveSoon') : t('changesAutoSave');
  }
  return { render, dispose() {
    if (disposed) return; disposed = true; uploadGeneration++; abort.abort(); cropImage?.close?.(); cropImage = null;
    for (const dialog of root.querySelectorAll('dialog[open]')) dialog.close();
    root.replaceChildren(); root.classList.remove('dsh-persona-settings');
  } };
}
