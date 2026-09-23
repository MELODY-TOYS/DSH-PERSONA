import { PREVIEW_REPLY, PREVIEW_SCENARIOS, USER_INPUT_CHUNKS, USER_MESSAGES } from './preview-copy.mjs';

export const PREVIEW_STORAGE_KEY = 'dsh-persona:chat-preview:v2';
const LEGACY_STORAGE_KEY = 'dsh-persona:chat-preview:v1';
/** DeepSeek V4.1 Flash (Reasoning, Max Effort) streams 218.6 output tokens/s on Artificial
 *  Analysis (artificialanalysis.ai/models/deepseek-v4-1-flash). These scripts measure about
 *  1.62 Chinese characters per token, so the simulated streams run at ~350 characters per
 *  second; the playback-rate control still scales that default. */
const OUTPUT_RATE = 350;

export const PREVIEW_DEFAULTS = Object.freeze({
  ...PREVIEW_SCENARIOS[2],
  speed: 1, inputRate: 12, sendPauseMs: 350, sendMs: 440, waitMs: 650,
  thinkingRate: OUTPUT_RATE, replyRate: OUTPUT_RATE, chunkSize: 3, variation: 45, holdMs: 2600,
  loop: true, collapseThinking: false,
});

export const PREVIEW_RANGES = Object.freeze({
  speed: [0.25, 3, 0.25], inputRate: [2, 50, 1], sendPauseMs: [0, 2000, 50],
  sendMs: [120, 1200, 20], waitMs: [0, 4000, 50], thinkingRate: [4, 600, 1],
  replyRate: [4, 600, 1], chunkSize: [1, 12, 1], variation: [0, 100, 5],
  holdMs: [500, 8000, 100],
});
const textLimits = { userText: 240, thinkingText: 900 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
export const previewGraphemes = text => segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);

/** Commit input words as one IME-like unit; whitespace stays verbatim. */
export function previewInputChunks(text) {
  const index = USER_MESSAGES.indexOf(text);
  if (index !== -1) return [...USER_INPUT_CHUNKS[index]];
  const words = wordSegmenter ? Array.from(wordSegmenter.segment(text), part => part.segment) : previewGraphemes(text);
  const chunks = [];
  let whitespace = '';
  for (const word of words) {
    if (/^\s+$/u.test(word)) whitespace += word;
    else { chunks.push(whitespace + word); whitespace = ''; }
  }
  if (whitespace) {
    if (chunks.length) chunks[chunks.length - 1] += whitespace;
    else chunks.push(whitespace);
  }
  return chunks;
}

export function normalizePreviewOptions(value, defaults = PREVIEW_DEFAULTS) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { ...defaults };
  for (const [key, [min, max]] of Object.entries(PREVIEW_RANGES)) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) result[key] = clamp(input[key], min, max);
  }
  result.chunkSize = Math.round(result.chunkSize);
  for (const [key, limit] of Object.entries(textLimits)) {
    if (typeof input[key] === 'string') result[key] = previewGraphemes(input[key]).slice(0, limit).join('');
  }
  for (const key of ['loop', 'collapseThinking']) if (typeof input[key] === 'boolean') result[key] = input[key];
  result.replyText = PREVIEW_REPLY;
  return result;
}

/** Playback speed is the only preference the preview exposes; every other timing value is
 *  authored here, so a stored value can never freeze an outdated script. */
export function readPreviewSpeed(storage, defaults = PREVIEW_DEFAULTS) {
  try {
    const raw = storage?.getItem(PREVIEW_STORAGE_KEY) ?? storage?.getItem(LEGACY_STORAGE_KEY);
    return normalizePreviewOptions({ speed: JSON.parse(raw ?? 'null')?.speed }, defaults).speed;
  }
  catch { return normalizePreviewOptions(null, defaults).speed; }
}

export function writePreviewSpeed(storage, speed) {
  try { storage?.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ speed })); return !!storage; }
  catch { return false; }
}

function streamChunks(chunks, rate, variation, commitPause = 0) {
  const events = [];
  const rhythm = [0.72, 1.12, 0.84, 1.38, 0.93, 1.06, 0.8];
  const charMs = 1000 / rate;
  let time = 0, text = '', part = 0;
  for (const chunk of chunks) {
    const jitter = 1 + (rhythm[part % rhythm.length] - 1) * variation;
    if (part) time += commitPause;
    time += previewGraphemes(chunk).length * charMs * jitter;
    text += chunk;
    events.push({ at: time, text });
    // Punctuation breathes for two extra character-times, scaled by the rhythm setting, so a
    // stream's pace stays proportional to its configured rate instead of a fixed pause budget.
    if (/[，。！？、,.!?;；：:\n]$/u.test(chunk)) time += 2 * charMs * variation;
    part++;
  }
  return { events, duration: time };
}

function stream(text, rate, chunkSize, variation) {
  const letters = previewGraphemes(text), chunks = [];
  for (let index = 0; index < letters.length; index += chunkSize) chunks.push(letters.slice(index, index + chunkSize).join(''));
  return streamChunks(chunks, rate, variation);
}

function textAt(streamValue, elapsed) {
  const events = streamValue.events;
  let low = 0, high = events.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].at <= elapsed) low = mid + 1; else high = mid;
  }
  return events[low - 1]?.text ?? '';
}

/** Virtual milliseconds keep pause, scrubbing and playback speed on the same timeline. */
export function buildPreviewTimeline(value, hasAssistant = true) {
  const options = normalizePreviewOptions(value);
  const canSend = options.userText.trim().length > 0;
  const includeAssistant = hasAssistant && canSend;
  const input = streamChunks(previewInputChunks(options.userText), options.inputRate, options.variation / 100, 80);
  const thinking = stream(options.thinkingText, options.thinkingRate, options.chunkSize, options.variation / 100);
  const reply = stream(options.replyText, options.replyRate, options.chunkSize, options.variation / 100);
  const phases = [];
  let duration = 0;
  function add(key, length) {
    const phase = { key, start: duration, end: duration + length };
    phases.push(phase); duration += length; return phase;
  }
  const typing = add('typing', 260 + input.duration + options.sendPauseMs);
  const sending = canSend ? add('sending', options.sendMs) : null;
  let waiting, reasoning, responding;
  if (includeAssistant) {
    waiting = add('waiting', options.waitMs);
    reasoning = add('thinking', thinking.duration);
    responding = add('replying', reply.duration);
  }
  add('complete', options.holdMs);
  return {
    options, phases, duration,
    sample(position) {
      const elapsed = clamp(Number.isFinite(position) ? position : 0, 0, duration);
      const phase = phases.find(item => elapsed < item.end) ?? phases.at(-1);
      return {
        phase: phase.key, elapsed, duration,
        progress: elapsed / duration,
        inputText: elapsed < typing.end ? textAt(input, elapsed - 260) : '',
        userText: options.userText, userVisible: sending !== null && elapsed >= sending.start,
        assistantVisible: includeAssistant && elapsed >= waiting.start,
        thinkingText: includeAssistant ? textAt(thinking, elapsed - reasoning.start) : '',
        thinkingMs: includeAssistant ? clamp(elapsed - reasoning.start, 0, thinking.duration) : 0,
        replyText: includeAssistant ? textAt(reply, elapsed - responding.start) : '',
      };
    },
  };
}

/** Owns one animation frame at most; inactive time never advances the scene. */
export function createPreviewPlayer({ options, hasAssistant = true, onFrame,
  now = () => performance.now(), requestFrame = fn => requestAnimationFrame(fn),
  cancelFrame = id => cancelAnimationFrame(id) }) {
  let settings = normalizePreviewOptions(options), assistant = hasAssistant;
  let timeline = buildPreviewTimeline(settings, assistant);
  let position = 0, playing = true, active = false, disposed = false, frame = null, last = null, cycle = 0;
  const snapshot = () => ({ ...timeline.sample(position), playing, active, running: playing && active && !disposed, cycle });
  const publish = () => { if (!disposed) onFrame(snapshot()); };
  function cancel() { if (frame !== null) cancelFrame(frame); frame = null; last = null; }
  function advance(time) {
    if (last !== null) position += Math.max(0, time - last) * settings.speed;
    last = time;
    if (position >= timeline.duration) {
      if (settings.loop) { cycle += Math.floor(position / timeline.duration); position %= timeline.duration; }
      else { position = timeline.duration; playing = false; last = null; }
    }
  }
  function schedule() {
    if (disposed || !active || !playing || frame !== null) return;
    last ??= now();
    frame = requestFrame(time => {
      frame = null;
      if (disposed || !active || !playing) return;
      advance(time); publish(); schedule();
    });
  }
  function replace(patch, nextAssistant = assistant) {
    cancel(); settings = normalizePreviewOptions(patch, settings); assistant = nextAssistant;
    timeline = buildPreviewTimeline(settings, assistant); position = 0; cycle++;
    publish(); schedule();
  }
  return {
    getSnapshot: snapshot,
    getOptions: () => ({ ...settings }),
    configure(patch) { if (!disposed) replace(patch); },
    setAssistant(value) { if (!disposed && value !== assistant) replace({}, value); },
    setActive(value) {
      if (disposed || active === value) return;
      if (active && playing) advance(now());
      cancel(); active = value; publish(); schedule();
    },
    play() {
      if (disposed) return;
      if (position >= timeline.duration) { position = 0; cycle++; }
      playing = true; publish(); schedule();
    },
    pause() {
      if (disposed) return;
      if (active && playing) advance(now());
      cancel(); playing = false; publish();
    },
    replay() { if (!disposed) { playing = true; replace({}); } },
    seek(value) {
      if (disposed) return;
      cancel(); playing = false;
      position = clamp(Number.isFinite(value) ? value : 0, 0, timeline.duration); publish();
    },
    dispose() { if (!disposed) { disposed = true; playing = false; cancel(); } },
  };
}
