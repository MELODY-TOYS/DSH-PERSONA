import { createAvatar, initials } from './index.mjs';
import { CHAT_AVATAR_SIZE } from './settings.mjs';
import { PREVIEW_DEFAULTS, createPreviewPlayer, readPreviewSpeed, writePreviewSpeed } from './preview-playback.mjs';

/** Keep decoded images when only the display name or unrelated form state changes. */
export function identityRenderer() {
  const rendered = new WeakMap();
  return (container, identity, role = 'assistant', size = 'normal') => {
    const previous = rendered.get(container);
    if (!previous) {
      container.replaceChildren(createAvatar(identity, role, size));
    } else {
      const node = container.firstElementChild;
      if (identity.name !== previous.name) {
        node.setAttribute('aria-label', identity.name);
        node.firstChild.nodeValue = initials(identity.name);
      }
      if (identity.avatar !== previous.avatar) {
        node.querySelector('img')?.remove();
        const image = createAvatar(identity, role, size).querySelector('img');
        if (image) node.append(image);
      }
    }
    if (!previous || identity.name !== previous.name || identity.avatar !== previous.avatar) {
      rendered.set(container, { name: identity.name, avatar: identity.avatar });
    }
    return container.firstElementChild;
  };
}

const phaseLabels = { typing: '输入中', sending: '发送中', waiting: '等待响应', thinking: '思考中', replying: '回复中', complete: '已完成' };
const speedOptions = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const timecode = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

export function mountChatPreview(container, scenario, signal) {
  const doc = container.ownerDocument, win = doc.defaultView;
  const abort = new AbortController(), renderIdentity = identityRenderer();
  const defaults = { ...PREVIEW_DEFAULTS, ...scenario };
  let storage;
  try { storage = win.localStorage; } catch { /* Sandboxed previews can disable browser storage. */ }
  const speedValue = readPreviewSpeed(storage, defaults);
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, hasAssistant = false, inView = false, observer;
  let lastPhase = '', lastCycle = -1, followEnd = true;
  const $ = selector => container.querySelector(selector);
  const on = (node, type, fn) => node.addEventListener(type, fn, { signal: abort.signal });
  container.innerHTML = `
    <div class="dsp-preview-toolbar">
      <span class="dsp-preview-state" role="status" aria-live="off"><i aria-hidden="true"></i><span></span></span>
      <span class="dsp-preview-local" title="本地模拟，不发送消息、不调用模型">本地模拟</span>
      <div class="dsp-preview-actions">
        <button type="button" data-preview-action="play" class="dsp-text-button" aria-label="暂停预览">暂停</button>
        <button type="button" data-preview-action="replay" class="dsp-text-button" title="从头播放">重播</button>
        <label class="dsp-preview-speed"><span class="dsp-sr-only">播放倍速</span><select aria-label="播放倍速" data-preview-option="speed">${speedOptions.map(value => '<option value="' + value + '">' + value + '×</option>').join('')}</select></label>
      </div>
    </div>
    <div class="dsp-preview-stage">
      <div class="dsp-preview-transcript" tabindex="0" aria-label="模拟对话" aria-live="off"><div class="dsp-preview-messages"></div></div>
      <div class="dsp-preview-composer">
        <div class="dsp-preview-composer-text" role="textbox" aria-label="模拟输入框" aria-readonly="true"><span class="dsp-preview-input-text"></span><span class="dsp-preview-caret" aria-hidden="true"></span></div>
        <span class="dsp-preview-send" aria-hidden="true">↑</span>
      </div>
    </div>
    <div class="dsp-preview-transport">
      <output class="dsp-preview-time" aria-live="off"></output>
      <input class="dsp-preview-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="预览播放进度">
    </div>`;
  const transcript = $('.dsp-preview-transcript'), messages = $('.dsp-preview-messages');
  const stage = $('.dsp-preview-stage'), inputText = $('.dsp-preview-input-text'), seek = $('.dsp-preview-seek');
  const speed = $('[data-preview-option="speed"]');
  const playButton = $('[data-preview-action="play"]'), stateText = $('.dsp-preview-state span'), time = $('.dsp-preview-time');
  function createRow(role) {
    const row = doc.createElement('div'); row.className = 'dsp-preview-message dsp-preview-' + role;
    row.hidden = true;
    const avatar = doc.createElement('span');
    const body = doc.createElement('div'); body.className = 'dsp-preview-copy';
    const name = doc.createElement('strong');
    const bubble = doc.createElement('p'); bubble.className = 'dsp-preview-bubble';
    body.append(name, bubble); row.append(avatar, body); messages.append(row);
    return { row, avatar, body, name, bubble };
  }
  const user = createRow('user'), assistant = createRow('assistant');
  const waiting = doc.createElement('span'); waiting.className = 'dsp-preview-waiting';
  waiting.textContent = '深度求索中...';
  assistant.body.insertBefore(waiting, assistant.bubble);
  const thinking = doc.createElement('details'); thinking.className = 'dsp-preview-thinking';
  thinking.innerHTML = '<summary><span class="dsp-preview-thinking-label">思考</span><span class="dsp-preview-thinking-separator" aria-hidden="true"></span><span class="dsp-preview-thinking-summary"><span></span></span></summary><p class="dsp-preview-thought"></p>';
  assistant.body.insertBefore(thinking, assistant.bubble);
  const thought = $('.dsp-preview-thought'), thinkingSummary = $('.dsp-preview-thinking-summary span');

  function paint(frame) {
    if (disposed) return;
    const phaseChanged = frame.phase !== lastPhase || frame.cycle !== lastCycle;
    container.dataset.phase = frame.phase; container.dataset.playing = String(frame.running);
    container.dataset.reduced = String(reduced.matches);
    setText(stateText, (frame.playing ? '' : '已暂停 · ') + phaseLabels[frame.phase]);
    setText(playButton, frame.playing ? '暂停' : '播放');
    playButton.setAttribute('aria-label', frame.playing ? '暂停预览' : '播放预览');
    setText(time, timecode(frame.elapsed) + ' / ' + timecode(frame.duration));
    seek.value = String(Math.round(frame.progress * 1000));
    seek.setAttribute('aria-valuetext', phaseLabels[frame.phase] + '，' + timecode(frame.elapsed));
    setText(inputText, frame.inputText || (frame.phase === 'typing' ? '' : '发消息或创建任务…'));
    user.row.hidden = !frame.userVisible; assistant.row.hidden = !frame.assistantVisible;
    setText(user.bubble, frame.userText);
    setText(thought, frame.thinkingText);
    const thoughtLines = frame.thinkingText.trimEnd().split('\n');
    setText(thinkingSummary, frame.phase === 'thinking' ? thoughtLines.at(-1) : thoughtLines[0]);
    waiting.hidden = frame.phase !== 'waiting';
    thinking.hidden = !frame.thinkingText;
    setText(assistant.bubble, frame.replyText);
    assistant.bubble.hidden = !['replying', 'complete'].includes(frame.phase);
    if (phaseChanged) {
      if (frame.phase === 'typing') { transcript.scrollTop = 0; followEnd = true; }
      if (frame.cycle !== lastCycle || frame.phase === 'waiting') thinking.open = !player.getOptions().collapseThinking;
    }
    if (followEnd && ['thinking', 'replying', 'complete'].includes(frame.phase)) transcript.scrollTop = transcript.scrollHeight;
    lastPhase = frame.phase; lastCycle = frame.cycle;
  }
  const player = createPreviewPlayer({ options: { ...defaults, speed: speedValue }, hasAssistant: false, onFrame: paint,
    now: () => win.performance.now(), requestFrame: fn => win.requestAnimationFrame(fn), cancelFrame: id => win.cancelAnimationFrame(id) });
  function syncControls() {
    const value = String(player.getOptions().speed);
    if (speed.value !== value) speed.value = value;
  }
  on(container, 'input', event => {
    if (event.target === seek) player.seek(Number(seek.value) / 1000 * player.getSnapshot().duration);
  });
  on(container, 'change', event => {
    if (event.target !== speed) return;
    player.configure({ speed: Number(speed.value) });
    writePreviewSpeed(storage, player.getOptions().speed);
  });
  on(container, 'click', event => {
    const action = event.target.closest('button')?.dataset.previewAction;
    if (action === 'play') { if (player.getSnapshot().playing) player.pause(); else player.play(); }
    if (action === 'replay') { followEnd = true; player.replay(); }
  });
  on(transcript, 'scroll', () => { followEnd = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 24; });
  const updateActivity = () => player.setActive(inView && !doc.hidden);
  on(doc, 'visibilitychange', updateActivity);
  on(reduced, 'change', () => { if (reduced.matches) player.seek(player.getSnapshot().duration); else paint(player.getSnapshot()); });
  if (typeof win.IntersectionObserver === 'function') {
    observer = new win.IntersectionObserver(entries => { inView = entries[0].isIntersecting; updateActivity(); });
    observer.observe(stage);
  } else { inView = true; }
  syncControls();
  if (reduced.matches) player.seek(player.getSnapshot().duration); else paint(player.getSnapshot());
  updateActivity();
  function updateIdentity(parts, value, role) {
    const identity = { name: value.name.trim() || '未命名', avatar: value.avatar };
    const avatar = renderIdentity(parts.avatar, identity, role);
    const size = CHAT_AVATAR_SIZE + 'px';
    if (avatar.style.getPropertyValue('--dsp-avatar-size') !== size) avatar.style.setProperty('--dsp-avatar-size', size);
    setText(parts.name, identity.name);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; player.dispose(); observer?.disconnect(); abort.abort();
    signal?.removeEventListener('abort', dispose); container.replaceChildren();
  }
  signal?.addEventListener('abort', dispose, { once: true });
  return {
    update(userValue, persona) {
      if (disposed) return;
      updateIdentity(user, userValue, 'user');
      if (persona) updateIdentity(assistant, persona, 'assistant');
      if (hasAssistant !== !!persona) {
        hasAssistant = !!persona; player.setAssistant(hasAssistant);
        if (reduced.matches) player.seek(player.getSnapshot().duration);
      }
    },
    dispose,
  };
}
