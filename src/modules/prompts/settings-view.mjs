import sharedStyles from '../../components/settings-shell.css';
import { bindDialogKeyboard } from '../../components/settings-dialogs.mjs';
import { selectionMotion } from '../../components/settings-motion.mjs';
import promptStyles from './settings.css';
import { PROMPT_TEXT_LIMIT, PROMPTS_RULE_LIMIT, targetKey } from './settings.mjs';
import { zhTranslate } from '../../locales.mjs';

const template = t => `
<form class="dsp-form dsp-prompts-form" novalidate>
  <p class="dsp-prompts-loading" role="status">${t('promptsLoading')}</p>
  <p class="dsp-prompts-unavailable dsp-hint" role="status" hidden>${t('promptsUnavailable')}</p>
  <p class="dsp-prompts-read-error dsp-validation" role="alert" hidden></p>
  <div class="dsp-prompts-content" hidden>
    <p class="dsp-prompts-readonly dsp-hint" role="status" hidden>${t('settingsReadOnly')}</p>
    <fieldset class="dsp-editable">
      <div class="dsp-section-heading"><h3>${t('prompts')} <span class="dsp-prompts-count dsp-hint"></span></h3><button type="button" data-action="new">${t('newPrompt')}</button></div>
      <p class="dsp-prompts-empty dsp-hint">${t('noPrompts')}</p>
      <div class="dsp-prompts-workspace dsp-settings-workspace" hidden>
        <div class="dsp-prompts-navigation">
          <div class="dsp-prompts-order" role="group" aria-label="${t('reorderPrompt')}"><span class="dsp-hint">${t('order')}</span><button type="button" data-action="up" class="dsp-text-button">${t('moveUp')}</button><button type="button" data-action="down" class="dsp-text-button">${t('moveDown')}</button></div>
          <nav class="dsp-prompts-list dsp-settings-list" aria-label="${t('promptOrder')}"></nav>
        </div>
        <div class="dsp-prompts-editor dsp-settings-editor">
          <label class="dsp-field"><span>${t('name')}</span><input data-control="name" maxlength="80" autocomplete="off" aria-label="${t('promptName')}"></label>
          <section class="dsp-prompts-targets" aria-labelledby="dsp-prompts-target-heading">
            <div class="dsp-section-heading"><h4 id="dsp-prompts-target-heading">${t('applyTo')}</h4><span class="dsp-prompts-selected-count dsp-hint"></span></div>
            <div class="dsp-prompts-summary" role="group" aria-label="${t('selectedTargets')}" tabindex="0"></div>
            <button type="button" data-action="toggleTargets" class="dsp-text-button dsp-disclosure-toggle" aria-expanded="true" aria-controls="dsp-prompts-target-picker">${t('collapseTargets')}</button>
            <div id="dsp-prompts-target-picker" class="dsp-disclosure-content">
              <div class="dsp-prompts-target-tools">
                <div class="dsp-prompts-kinds" role="group" aria-label="${t('targetType')}"><button type="button" data-kind="persona" aria-pressed="true">${t('personaGroup')}</button><button type="button" data-kind="model" aria-pressed="false">${t('nativeModel')}</button></div>
                <input type="search" data-control="search" placeholder="${t('searchTargetsPlaceholder')}" aria-label="${t('searchTargets')}">
              </div>
              <div class="dsp-prompts-target-list" role="group" aria-labelledby="dsp-prompts-target-heading"></div>
            </div>
            <p class="dsp-prompts-source-status dsp-hint" role="status" hidden></p>
            <button type="button" data-action="retry" class="dsp-text-button" hidden>${t('retry')}</button>
            <p class="dsp-prompts-target-warning dsp-validation" role="status" hidden></p>
          </section>
          <label class="dsp-field"><span>${t('prompt')}</span><textarea data-control="prompt" rows="10" maxlength="64000" spellcheck="false" aria-label="${t('promptContent')}" aria-describedby="dsp-prompts-effect-note"></textarea></label>
          <div class="dsp-prompts-caption"><p class="dsp-hint" id="dsp-prompts-effect-note">${t('promptEffect')}</p><span class="dsp-prompts-length dsp-hint"></span></div>
          <div class="dsp-prompts-actions"><button type="button" data-action="delete" class="dsp-text-button">${t('deletePrompt')}</button></div>
        </div>
      </div>
    </fieldset>
    <div class="dsp-save-footer">
      <p class="dsp-validation dsp-prompts-validation" role="alert" hidden></p>
      <div class="dsp-conflict" role="alert" hidden>${t('settingsConflict')}<button type="button" class="dsp-text-button" data-action="reload">${t('discardAndReload')}</button></div>
      <div class="dsp-save-row"><span class="dsp-save-status dsp-hint" role="status">${t('changesAutoSave')}</span><button type="button" class="dsp-text-button dsp-save-retry" data-action="retrySave" hidden>${t('retryAutoSave')}</button></div>
    </div>
  </div>
</form>
<dialog class="dsp-prompts-delete" aria-labelledby="dsp-prompts-delete-title"><h3 id="dsp-prompts-delete-title">${t('deletePromptQuestion')}</h3><p class="dsp-prompts-delete-copy dsp-hint"></p><div class="dsp-dialog-actions"><button type="button" data-action="cancelDelete" autofocus>${t('cancel')}</button><button type="button" data-action="confirmDelete">${t('delete')}</button></div></dialog>`;
const element = (tag, text = '', className = '') => {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
};

export function mountPromptSettings(root, actions, { t = zhTranslate } = {}) {
  const abort = new AbortController();
  bindDialogKeyboard(root, abort.signal);
  root.classList.add('dsh-persona-settings', 'dsp-prompts-settings'); root.innerHTML = template(t);
  const style = element('style'); style.textContent = sharedStyles + '\n' + promptStyles; root.prepend(style);
  const $ = selector => root.querySelector(selector), field = key => $(`[data-control="${key}"]`);
  const on = (node, type, listener) => node.addEventListener(type, listener, { signal: abort.signal });
  const animateSelection = selectionMotion($('.dsp-prompts-editor'), abort.signal);
  let state, kind = 'persona', query = '', disposed = false, deleteId, listSignature = '', targetsSignature = '';
  let selectedRuleId, targetsOpen = true, summarySignature = '';
  function setTargetsOpen(open) {
    targetsOpen = open;
    const toggle = $('[data-action="toggleTargets"]');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = t(open ? 'collapseTargets' : 'editTargets');
    if (!open && $('#dsp-prompts-target-picker').contains(document.activeElement)) toggle.focus({ preventScroll: true });
    $('#dsp-prompts-target-picker').hidden = !open;
  }
  const editRule = change => actions.edit(doc => { const rule = doc.rules.find(r => r.id === state.selectedId); if (rule) change(rule); });
  const setText = (selector, text) => { const node = $(selector); node.textContent = text; node.hidden = !text; };
  on(root, 'input', event => {
    const key = event.target.dataset.control;
    if (key === 'search') { query = event.target.value; render(state); }
    if (key === 'name' || key === 'prompt') editRule(rule => { rule[key] = event.target.value; });
  });
  on(root, 'change', event => {
    const key = event.target.dataset.target;
    if (!key) return;
    const candidate = state.candidates.find(row => row.key === key);
    if (!candidate) return;
    editRule(rule => {
      rule.targets = rule.targets.filter(target => targetKey(target) !== key);
      if (event.target.checked && candidate.available) rule.targets.push(candidate.target);
    });
  });
  on($('.dsp-form'), 'submit', event => { event.preventDefault(); });
  on(root, 'click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.rule) { actions.select(button.dataset.rule); return; }
    if (button.dataset.kind) { kind = button.dataset.kind; query = ''; field('search').value = ''; render(state); return; }
    switch (button.dataset.action) {
      case 'toggleTargets': setTargetsOpen(!targetsOpen); break;
      case 'new': {
        const id = `prompt-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
        actions.edit(doc => doc.rules.push({ id, name: '', prompt: '', targets: [] }));
        actions.select(id); field('name').focus(); break;
      }
      case 'up': case 'down':
        actions.edit(doc => {
          const index = doc.rules.findIndex(rule => rule.id === state.selectedId), next = index + (button.dataset.action === 'up' ? -1 : 1);
          if (index >= 0 && next >= 0 && next < doc.rules.length) [doc.rules[index], doc.rules[next]] = [doc.rules[next], doc.rules[index]];
        }); break;
      case 'delete':
        deleteId = state.selectedId;
        $('.dsp-prompts-delete-copy').textContent = t('deletePromptDetail', {
          name: state.value.rules.find(rule => rule.id === deleteId).name || t('unnamedPrompt'),
        });
        $('.dsp-prompts-delete').showModal(); break;
      case 'cancelDelete': $('.dsp-prompts-delete').close(); break;
      case 'confirmDelete':
        actions.edit(doc => { doc.rules = doc.rules.filter(rule => rule.id !== deleteId); });
        $('.dsp-prompts-delete').close(); $('[data-action="new"]').focus(); break;
      case 'reload': actions.discard(); break;
      case 'retry': void actions.refreshCatalog(); break;
      case 'retrySave': void actions.save(); break;
    }
  });
  function render(next) {
    if (disposed || !next) return;
    state = next;
    $('.dsp-prompts-loading').hidden = next.available || next.unavailable || Boolean(next.error);
    $('.dsp-prompts-unavailable').hidden = !next.unavailable;
    $('.dsp-prompts-content').hidden = !next.available || next.unavailable;
    setText('.dsp-prompts-read-error', !next.available ? next.error : '');
    if (!next.available || next.unavailable) animateSelection(null);
    if (!next.value || next.unavailable) return;
    $('.dsp-prompts-readonly').hidden = next.writable;
    $('.dsp-editable').disabled = !next.writable;
    const rules = next.value.rules, rule = rules.find(item => item.id === next.selectedId);
    $('.dsp-prompts-count').textContent = String(rules.length);
    $('.dsp-prompts-empty').hidden = Boolean(rule); $('.dsp-prompts-workspace').hidden = !rule;
    $('[data-action="new"]').disabled = rules.length >= PROMPTS_RULE_LIMIT || !next.writable;
    const signature = JSON.stringify(rules.map(item => [item.id, item.name, item.targets.length]));
    if (signature !== listSignature) {
      const focused = document.activeElement?.dataset.rule;
      listSignature = signature; const list = $('.dsp-prompts-list'); list.replaceChildren();
      rules.forEach((item, index) => {
        const button = element('button', '', 'dsp-prompts-rule'); button.type = 'button'; button.dataset.rule = item.id;
        button.append(element('span', String(index + 1), 'dsp-prompts-index'), element('strong', item.name || t('unnamedPrompt')), element('small', t('promptTargetCount', { count: item.targets.length }), 'dsp-hint')); list.append(button);
      });
      if (focused) [...list.children].find(node => node.dataset.rule === focused)?.focus({ preventScroll: true });
    }
    for (const node of $('.dsp-prompts-list').children) node.setAttribute('aria-current', String(node.dataset.rule === next.selectedId));
    if (rule) {
      if (selectedRuleId !== rule.id) {
        selectedRuleId = rule.id; query = ''; field('search').value = '';
        kind = rule.targets[0]?.kind ?? 'persona';
        setTargetsOpen(rule.targets.length === 0);
      }
      if (next.available) animateSelection(rule.id);
      for (const key of ['name', 'prompt']) {
        if (field(key).value !== rule[key]) field(key).value = rule[key];
        field(key).setAttribute('aria-invalid', String(!rule[key].trim()));
      }
      $('.dsp-prompts-length').textContent = `${rule.prompt.length} / ${PROMPT_TEXT_LIMIT}`;
      const selected = new Set(rule.targets.map(targetKey));
      const groups = rule.targets.filter(target => target.kind === 'persona').length;
      const candidateName = candidate => candidate?.target.kind === 'persona' && !candidate.available
        ? t('deletedPersona') : candidate?.name;
      const candidateDetail = candidate => {
        if (candidate?.target.kind !== 'persona' || !candidate.available) return candidate?.detail;
        const persona = next.library.personas.find(item => item.id === candidate.target.personaId);
        return persona ? t('personaModelCount', { count: persona.models.length }) : candidate.detail;
      };
      $('.dsp-prompts-selected-count').textContent = t('selectedTargetCounts', { groups, models: selected.size - groups });
      const summary = rule.targets.map(target => {
        const candidate = next.candidates.find(row => row.key === targetKey(target));
        const type = t(target.kind === 'persona' ? 'personaGroup' : 'nativeModel');
        const fallback = target.kind === 'persona' ? target.personaId : `${target.provider} / ${target.model}`;
        const name = candidateName(candidate) ?? fallback;
        const label = target.kind === 'model' || !candidate?.available
          ? t('targetLabelWithId', { type, name, id: fallback }) : t('targetLabel', { type, name });
        return { label, detail: candidateDetail(candidate) ?? fallback, unavailable: !candidate?.available };
      });
      const signature = JSON.stringify(summary);
      if (signature !== summarySignature) {
        summarySignature = signature;
        const list = $('.dsp-prompts-summary'); list.replaceChildren();
        for (const item of summary) {
          const tag = element('span', item.label + (item.unavailable ? t('unavailableTag') : ''), 'dsp-target-tag');
          tag.title = item.detail;
          if (item.unavailable) tag.dataset.unavailable = '';
          list.append(tag);
        }
        if (!summary.length) list.append(element('p', t('noTargetsSelected'), 'dsp-hint'));
      }
      for (const node of root.querySelectorAll('[data-kind]')) node.setAttribute('aria-pressed', String(node.dataset.kind === kind));
      const targetSignature = JSON.stringify([next.candidates, [...selected], kind, query]);
      if (targetSignature !== targetsSignature) {
        targetsSignature = targetSignature;
        const list = $('.dsp-prompts-target-list'), scroll = list.scrollTop, focusKey = document.activeElement?.dataset.target;
        list.replaceChildren();
        const filtered = next.candidates.filter(row => row.target.kind === kind && `${candidateName(row)} ${candidateDetail(row)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
        for (const row of filtered) {
          const label = element('label', '', 'dsp-prompts-target'), checkbox = document.createElement('input');
          checkbox.type = 'checkbox'; checkbox.dataset.target = row.key; checkbox.checked = selected.has(row.key);
          checkbox.disabled = !row.available && !checkbox.checked;
          const copy = element('span'); copy.append(element('span', candidateName(row)), element('small', candidateDetail(row), 'dsp-hint'));
          label.append(checkbox, copy); if (!row.available) label.append(element('small', t('unavailable'), 'dsp-hint')); list.append(label);
        }
        if (!filtered.length) list.append(element('p', t(query ? 'noMatches' : kind === 'persona' ? 'noPersonaGroups' : 'noModels'), 'dsp-hint'));
        list.scrollTop = scroll;
        if (focusKey) [...list.querySelectorAll('input')].find(node => node.dataset.target === focusKey)?.focus({ preventScroll: true });
      }
      const missing = next.candidates.filter(row => selected.has(row.key) && !row.available).length;
      setText('.dsp-prompts-target-warning', missing ? t('unavailableTargets', { count: missing }) : '');
      $('[data-action="up"]').disabled = rules[0]?.id === rule.id || !next.writable;
      $('[data-action="down"]').disabled = rules.at(-1)?.id === rule.id || !next.writable;
    }
    if (!rule) { selectedRuleId = undefined; animateSelection(null); }
    const catalogMessage = next.catalogError || (next.catalogPartial ? t('partialTargetCatalog') : next.catalogStatus === 'loading' ? t('loadingModels') : '');
    setText('.dsp-prompts-source-status', kind === 'persona' ? next.libraryError : catalogMessage);
    $('[data-action="retry"]').hidden = kind === 'persona' || (!next.catalogError && !next.catalogPartial);
    setText('.dsp-prompts-validation', next.error || (next.dirty ? next.validationError : ''));
    $('.dsp-conflict').hidden = !next.conflicted;
    $('.dsp-save-retry').hidden = !next.error || !next.dirty || !next.writable || next.saving || next.conflicted;
    $('.dsp-save-status').textContent = next.conflicted ? '' : next.saving ? t('autoSaving') : next.saved ? t('autoSaved')
      : next.dirty && next.validationError ? t('fixBeforeAutoSave') : next.dirty && !next.error ? t('autoSaveSoon') : t('changesAutoSave');
  }
  return { render, dispose() {
    if (disposed) return; disposed = true; abort.abort();
    for (const dialog of root.querySelectorAll('dialog[open]')) dialog.close();
    root.replaceChildren(); root.classList.remove('dsh-persona-settings', 'dsp-prompts-settings');
  } };
}
