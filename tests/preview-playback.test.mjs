import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_DEFAULTS, PREVIEW_STORAGE_KEY, buildPreviewTimeline, createPreviewPlayer,
  normalizePreviewOptions, previewGraphemes, previewInputChunks, readPreviewSpeed, writePreviewSpeed } from '../src/modules/avatar/preview-playback.mjs';
import { PREVIEW_SCENARIOS } from '../src/modules/avatar/preview-copy.mjs';

const script = { ...PREVIEW_DEFAULTS, userText: '你好，周五见！', thinkingText: '确认时间。再回复。', variation: 0 };
const phase = (timeline, key) => timeline.phases.find(item => item.key === key);

function fixture(t, options = script) {
  let clock = 0, id = 0, latest;
  const pending = new Map();
  const player = createPreviewPlayer({ options, onFrame: value => { latest = value; }, now: () => clock,
    requestFrame: callback => { pending.set(++id, callback); return id; },
    cancelFrame: key => pending.delete(key) });
  t.after(() => { player.dispose(); assert.equal(pending.size, 0); });
  return { player, pending, get frame() { return latest; },
    tick(ms) { clock += ms; const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(clock); } };
}

test('preview walks input, sending, latency, thinking, reply and end with exact text', () => {
  const timeline = buildPreviewTimeline(script);
  assert.deepEqual(timeline.phases.map(item => item.key), ['typing', 'sending', 'waiting', 'thinking', 'replying', 'complete']);
  assert.equal(timeline.sample(0).inputText, '');
  const sending = timeline.sample(phase(timeline, 'sending').start);
  assert.equal(sending.userText, script.userText);
  assert.equal(sending.inputText, '');
  assert.equal(sending.userVisible, true);
  assert.equal(sending.assistantVisible, false);
  const waiting = timeline.sample(phase(timeline, 'waiting').start);
  assert.equal(waiting.assistantVisible, true);
  assert.equal(waiting.thinkingText, '');
  const replying = timeline.sample(phase(timeline, 'replying').start);
  assert.equal(replying.thinkingText, script.thinkingText);
  assert.equal(replying.replyText, '');
  const end = timeline.sample(timeline.duration);
  assert.equal(end.replyText, script.replyText);
  assert.equal(end.progress, 1);
});

test('rates, send duration, latency and chunk sizes change their own timeline behavior', () => {
  const base = buildPreviewTimeline({ ...script, replyRate: 30, chunkSize: 3 });
  const fast = buildPreviewTimeline({ ...script, inputRate: 24, sendMs: 800, waitMs: 1800, replyRate: 60, chunkSize: 1 });
  assert.ok(phase(fast, 'typing').end < phase(base, 'typing').end);
  assert.ok(Math.abs(phase(fast, 'sending').end - phase(fast, 'sending').start - 800) < 1e-8);
  assert.ok(Math.abs(phase(fast, 'waiting').end - phase(fast, 'waiting').start - 1800) < 1e-8);
  assert.ok(phase(fast, 'replying').end - phase(fast, 'replying').start < phase(base, 'replying').end - phase(base, 'replying').start);
  assert.equal(base.sample(phase(base, 'replying').start + 65).replyText, '');
  assert.equal(base.sample(phase(base, 'replying').start + 67).replyText, '收到');
  assert.equal(fast.sample(phase(fast, 'replying').start + 18).replyText, '收');
});

test('typing preserves graphemes including combined emoji and accents', () => {
  const text = '你👨‍👩‍👧‍👦e\u0301！';
  assert.equal(previewGraphemes(text).length, 4);
  const timeline = buildPreviewTimeline({ ...script, userText: text, inputRate: 10 });
  assert.equal(timeline.sample(361).inputText, '你');
  assert.equal(timeline.sample(541).inputText, '你👨‍👩‍👧‍👦');
  assert.equal(timeline.sample(721).inputText, '你👨‍👩‍👧‍👦e\u0301');
});

test('user input commits the requested phrases atomically with pauses between commits', () => {
  const userText = '@所有人 这周五聚餐';
  assert.deepEqual(previewInputChunks(userText), ['@', '所有人', ' 这', '周五', '聚餐']);
  const timeline = buildPreviewTimeline({ ...script, userText, inputRate: 10 });
  for (const [at, before, after] of [[360, '', '@'], [740, '@', '@所有人'], [1020, '@所有人', '@所有人 这'],
    [1300, '@所有人 这', '@所有人 这周五'], [1580, '@所有人 这周五', userText]]) {
    assert.equal(timeline.sample(at - 1).inputText, before);
    assert.equal(timeline.sample(at).inputText, after);
  }
});

test('custom input keeps words, emoji, punctuation and whitespace intact', () => {
  const userText = 'hello  world 👋🏽\n开会！  ';
  const chunks = previewInputChunks(userText);
  assert.equal(chunks.join(''), userText);
  assert.equal(chunks[0], 'hello');
  assert.equal(chunks[1], '  world');
  assert.ok(chunks.includes(' 👋🏽'));
  assert.deepEqual(previewInputChunks(' \n '), [' \n ']);
  assert.deepEqual(previewInputChunks(''), []);
});

test('an empty Persona library simulates only the user and never creates an agent response', () => {
  const timeline = buildPreviewTimeline(script, false);
  assert.deepEqual(timeline.phases.map(item => item.key), ['typing', 'sending', 'complete']);
  assert.equal(timeline.sample(timeline.duration).assistantVisible, false);
  assert.equal(timeline.sample(timeline.duration).replyText, '');
});

test('blank input never sends a message or triggers an assistant response', () => {
  const timeline = buildPreviewTimeline({ ...script, userText: ' \n ' });
  assert.deepEqual(timeline.phases.map(item => item.key), ['typing', 'complete']);
  const end = timeline.sample(timeline.duration);
  assert.equal(end.userVisible, false);
  assert.equal(end.assistantVisible, false);
  assert.equal(end.replyText, '');
});

test('hidden and paused time does not advance; speed scales virtual time', t => {
  const f = fixture(t);
  assert.equal(f.pending.size, 0);
  f.player.setActive(true); f.tick(300);
  assert.equal(f.frame.elapsed, 300);
  f.player.pause(); f.tick(5000);
  assert.equal(f.frame.elapsed, 300);
  assert.equal(f.pending.size, 0);
  f.player.play(); f.tick(100);
  assert.equal(f.frame.elapsed, 400);
  f.player.setActive(false); f.tick(5000);
  assert.equal(f.frame.elapsed, 400);
  f.player.setActive(true); f.tick(100);
  assert.equal(f.frame.elapsed, 500);
  f.player.configure({ speed: 2 }); f.tick(120);
  assert.equal(f.frame.elapsed, 240);
  assert.equal(f.pending.size, 1);
});

test('scrubbing pauses at the requested stage and play continues from it', t => {
  const f = fixture(t), timeline = buildPreviewTimeline(script);
  f.player.setActive(true);
  const thinking = phase(timeline, 'thinking');
  const target = thinking.start + (thinking.end - thinking.start) / 2;
  f.player.seek(target);
  assert.equal(f.frame.phase, 'thinking');
  assert.equal(f.frame.elapsed, target);
  assert.equal(f.frame.playing, false);
  assert.equal(f.pending.size, 0);
  f.player.play(); f.tick(40);
  assert.equal(f.frame.elapsed, target + 40);
  f.player.replay();
  assert.equal(f.frame.phase, 'typing');
  assert.equal(f.frame.elapsed, 0);
});

test('single play stops and looping reuses the timeline without accumulating frames', t => {
  const f = fixture(t, { ...script, loop: false });
  const duration = f.player.getSnapshot().duration;
  f.player.setActive(true); f.tick(duration + 100);
  assert.equal(f.frame.phase, 'complete');
  assert.equal(f.frame.playing, false);
  assert.equal(f.pending.size, 0);
  f.tick(5000); f.player.play(); f.tick(60);
  assert.equal(f.frame.elapsed, 60);
  f.player.configure({ loop: true }); f.player.play(); f.tick(duration * 2 + 300);
  assert.equal(Math.round(f.frame.elapsed), 300);
  assert.equal(f.pending.size, 1);
  assert.ok(f.frame.cycle >= 2);
});

test('disposal cancels scheduled work and rejects a late captured frame', t => {
  const f = fixture(t); f.player.setActive(true);
  const late = [...f.pending.values()][0], previous = f.frame;
  f.player.dispose(); late(2000);
  f.player.play(); f.player.configure({ inputRate: 50 }); f.player.replay();
  assert.equal(f.pending.size, 0);
  assert.equal(f.frame, previous);
});

test('preview options reject malformed values and playback speed survives unavailable storage', () => {
  const options = normalizePreviewOptions({ speed: Infinity, sendMs: -50, replyRate: 1e9, chunkSize: 2.8,
    loop: 'yes', userText: '👋'.repeat(500), unexpected: 'discard' });
  assert.equal(options.speed, 1);
  assert.equal(options.sendMs, 120);
  assert.equal(options.replyRate, 600);
  assert.equal(options.chunkSize, 3);
  assert.equal(options.loop, true);
  assert.equal(previewGraphemes(options.userText).length, 240);
  assert.equal(Object.hasOwn(options, 'unexpected'), false);
  const unavailable = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal(readPreviewSpeed(unavailable, script), script.speed);
  assert.equal(writePreviewSpeed(unavailable, 2), false);
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  values.set(PREVIEW_STORAGE_KEY, '{');
  assert.equal(readPreviewSpeed(storage, script), script.speed);
  assert.equal(writePreviewSpeed(storage, 2), true);
  assert.equal(readPreviewSpeed(storage, script), 2);
  values.set(PREVIEW_STORAGE_KEY, JSON.stringify({ speed: 1e9 }));
  assert.equal(readPreviewSpeed(storage, script), 3);
});

test('a stored script cannot override the authored copy or the fixed reply', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  values.set('dsh-persona:chat-preview:v1', JSON.stringify({ speed: 0.5, userText: '自定义消息',
    thinkingText: '这是一条周五聚餐通知。先确认收到，再确认具体时间和地点。', replyText: '收到，周五见！' }));
  assert.equal(readPreviewSpeed(storage, script), 0.5);
  const timeline = buildPreviewTimeline({ ...PREVIEW_DEFAULTS, ...PREVIEW_SCENARIOS[2], speed: 0.5 });
  assert.equal(timeline.options.thinkingText, PREVIEW_SCENARIOS[2].thinkingText);
  assert.equal(timeline.options.userText, PREVIEW_SCENARIOS[2].userText);
  assert.equal(timeline.sample(timeline.duration).replyText, '收到');
});
