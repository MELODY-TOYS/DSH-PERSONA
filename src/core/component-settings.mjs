const DEFAULT_AUTO_SAVE_DELAY = 500;

/** A component-local draft, fenced by its starting revision and optional scope.sourceId. */
export class ComponentSettingsController {
  #scope; #parse; #defaults; #unsubscribe; #listeners = new Set(); #snapshot;
  #draft = null; #revision; #sourceId; #saving = false; #error = ''; #saved = false;
  #disposed = false; #generation = 0; #autoSaveDelay; #saveTimer = null;
  constructor(scope, { parse, defaults, autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY }) {
    this.#scope = scope; this.#parse = parse; this.#defaults = defaults; this.#autoSaveDelay = autoSaveDelay;
    this.#publish();
    this.#unsubscribe = scope.subscribe(() => this.#publish());
  }
  getSnapshot = () => this.#snapshot;
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  #read() {
    const scope = this.#scope.getSnapshot();
    let current = null, error = '';
    if (scope.status === 'ready') {
      try {
        const document = scope.value?.document;
        if (document !== undefined && (typeof document !== 'string' || document.length > 4_000_000)) throw new Error('配置文档格式错误或过大。');
        current = this.#parse(document === undefined ? this.#defaults() : JSON.parse(document));
      } catch (e) { error = `无法读取已保存配置：${e.message}`; }
    }
    return { scope, current, error };
  }
  #clearSaveTimer() {
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
  }
  #queueAutoSave() {
    this.#clearSaveTimer();
    const state = this.#snapshot;
    if (this.#disposed || this.#saving || !state?.available || !state.writable || !state.dirty ||
      state.validationError || state.conflicted || state.error) return;
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.save();
    }, this.#autoSaveDelay);
  }
  #publish() {
    if (this.#disposed) return;
    const { scope, current, error } = this.#read();
    const sameSource = this.#draft === null || scope.sourceId === this.#sourceId;
    // A pending write may still change current; retain a reverted draft until it settles.
    if (this.#draft !== null && !this.#saving && sameSource && current !== null &&
      JSON.stringify(this.#draft) === JSON.stringify(current)) {
      this.#draft = null; this.#revision = undefined; this.#sourceId = undefined;
    }
    const value = this.#draft ?? current;
    let validationError = '';
    if (value) { try { this.#parse(value); } catch (e) { validationError = e.message; } }
    const dirty = this.#draft !== null && (!sameSource || JSON.stringify(this.#draft) !== JSON.stringify(current));
    this.#snapshot = {
      value, dirty, available: current !== null, writable: Boolean(scope.writable) && !error,
      loading: scope.status !== 'ready', saving: this.#saving,
      conflicted: dirty && !this.#saving && (!sameSource || scope.revision !== this.#revision),
      error: !sameSource ? '宿主已变更，修改已保留。请复制需要保留的内容后重新载入。' : error || this.#error,
      validationError, saved: this.#saved && !dirty,
    };
    for (const listener of this.#listeners) listener();
    this.#queueAutoSave();
  }
  edit = change => {
    const before = this.#snapshot;
    if (this.#disposed || !before.available || !before.writable) return;
    const next = structuredClone(before.value);
    try {
      change(next);
      if (this.#draft === null) {
        const scope = this.#scope.getSnapshot();
        this.#revision = scope.revision; this.#sourceId = scope.sourceId;
      }
      this.#draft = next; this.#error = ''; this.#saved = false;
    } catch (error) { this.#error = error.message; }
    this.#publish();
  };
  save = async () => {
    this.#clearSaveTimer();
    const before = this.#snapshot;
    if (this.#disposed || this.#saving || !before.available || !before.writable || !before.dirty || before.validationError) return false;
    const scope = this.#scope.getSnapshot();
    if (scope.revision !== this.#revision || scope.sourceId !== this.#sourceId) { this.#publish(); return false; }
    const submittedDraft = JSON.stringify(this.#draft);
    const desired = JSON.stringify(this.#parse(this.#draft));
    const expectedRevision = this.#revision;
    const generation = ++this.#generation;
    this.#saving = true; this.#error = ''; this.#publish();
    let failure = '';
    try {
      // DSH resolves a refused write to false after reloading the Host state.
      const accepted = await this.#scope.mutate([{ op: 'set', path: ['document'], value: desired }], expectedRevision);
      if (accepted === false) failure = '宿主拒绝了这次保存，修改已保留。请重试，或重新载入配置。';
    } catch (error) { failure = error.message || '自动保存失败。'; }
    if (this.#disposed || generation !== this.#generation) return false;
    this.#saving = false;
    if (this.#scope.getSnapshot().sourceId !== scope.sourceId) { this.#publish(); return false; }
    let landed = false;
    try { const current = this.#read().current; landed = current !== null && JSON.stringify(current) === desired; } catch { /* Failed reads are exposed below. */ }
    if (landed && !failure) {
      if (this.#draft !== null && JSON.stringify(this.#draft) === submittedDraft) {
        this.#draft = null; this.#revision = undefined; this.#sourceId = undefined; this.#saved = true;
      } else {
        this.#revision = this.#scope.getSnapshot().revision; this.#saved = false;
      }
    } else this.#error = failure || '自动保存未得到宿主确认，修改已保留。';
    this.#publish();
    return landed && !failure;
  };
  /** An explicit reset drops the draft. Already admitted Host writes cannot be cancelled. */
  discard = () => {
    this.#generation++; this.#clearSaveTimer(); this.#draft = null; this.#revision = undefined; this.#sourceId = undefined;
    this.#saving = false; this.#error = ''; this.#saved = false; this.#publish();
  };
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation++; this.#clearSaveTimer(); this.#unsubscribe?.(); this.#listeners.clear();
  }
}
