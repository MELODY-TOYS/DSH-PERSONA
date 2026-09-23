import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAvatarSettings, parseAvatarSettings, CHAT_AVATAR_SIZE } from '../src/modules/avatar/settings.mjs';
import { USER_MESSAGES, PREVIEW_SCENARIOS, choosePreviewScenario } from '../src/modules/avatar/preview-copy.mjs';
import { readModel, modelForNode } from '../src/adapters/dsh/model-history.mjs';
import { readFileSync } from 'node:fs';

const route = { provider: 'provider-a', model: 'model-a' };

test('installed presentation is fixed and v2 display toggles are discarded', () => {
  assert.equal(CHAT_AVATAR_SIZE, 40);
  const old = { version: 2, enabled: false, showUser: false, showAssistant: false, showNames: false, size: 28,
    user: { name: '你', avatar: null }, library: { schemaVersion: 2, personas: [] } };
  assert.deepEqual(parseAvatarSettings(old), defaultAvatarSettings());
});

test('preview scripts retain the user samples and provide matching thinking and replies', () => {
  assert.deepEqual(USER_MESSAGES, [
    '@所有人 10点周会',
    '@所有人 这周自愿加班到8点',
    '@所有人 这周五聚餐',
  ]);
  assert.equal(choosePreviewScenario(() => 0).userText, USER_MESSAGES[0]);
  assert.equal(choosePreviewScenario(() => 0.999).userText, USER_MESSAGES[2]);
  assert.equal(choosePreviewScenario(() => NaN).userText, USER_MESSAGES[0]);
  assert.ok(PREVIEW_SCENARIOS.every(item => item.thinkingText.length > 10 && item.replyText === '收到'));
  assert.notEqual(choosePreviewScenario(() => 0), PREVIEW_SCENARIOS[0]);
});

test('assistant route prefers the finalized request and falls back to the preceding request header', () => {
  assert.deepEqual(readModel(route), route);
  const settled = { kind: 'assistant-step', anchorSeq: 20, data: { finalNode: { requestConfig: route } } };
  assert.deepEqual(modelForNode(settled, []), route);
  const running = { kind: 'assistant-step', anchorSeq: 20, data: {} };
  assert.deepEqual(modelForNode(running, [{ seq: 10, model: route }, { seq: 30, model: { provider: 'b', model: 'b' } }]), route);
  assert.equal(modelForNode({ kind: 'user', anchorSeq: 20, data: {} }, [{ seq: 10, model: route }]), null);
});

test('native client registers chat avatar integration without replacing chat node renderers', () => {
  const client = readFileSync(new URL('../src/adapters/dsh/client.mjs', import.meta.url), 'utf8');
  const chat = readFileSync(new URL('../src/adapters/dsh/register-chat.mjs', import.meta.url), 'utf8');
  assert.match(client, /registerChatAvatars/);
  assert.match(chat, /conversation\.composer\.dock/);
  assert.doesNotMatch(chat, /conversation\.chat\.node/);
});

test('preview exposes playback speed next to the transport controls and no pace parameters', () => {
  const preview = readFileSync(new URL('../src/modules/avatar/chat-preview.mjs', import.meta.url), 'utf8');
  assert.match(preview, /dsp-preview-actions[\s\S]*data-preview-action="play"[\s\S]*data-preview-action="replay"[\s\S]*dsp-preview-speed/);
  assert.doesNotMatch(preview, /播放参数|dsp-preview-parameters|dsp-preview-script|dsp-preview-reset|恢复默认/);
  assert.doesNotMatch(preview, /data-preview-option="(inputRate|sendPauseMs|sendMs|waitMs|thinkingRate|replyRate|chunkSize|variation|holdMs)"/);
  const styles = readFileSync(new URL('../src/modules/avatar/chat-preview.css', import.meta.url), 'utf8');
  assert.doesNotMatch(styles, /dsp-preview-parameters|dsp-preview-options|dsp-preview-parameter|dsp-preview-checks|dsp-preview-script|dsp-preview-reset/);
  assert.match(styles, /dsp-preview-speed select/);
});
