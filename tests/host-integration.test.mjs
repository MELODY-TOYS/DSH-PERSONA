import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import * as avatarHost from '../src/adapters/dsh/host.mjs';
import * as promptsHost from '../src/modules/prompts/host.mjs';
import { AVATAR_NAMESPACE, defaultAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { PROMPTS_NAMESPACE } from '../src/modules/prompts/settings.mjs';

async function fixture(t) {
  const root = new Context();
  t.after(() => root.fiber.dispose());
  const avatar = defaultAvatarSettings();
  avatar.library.personas.push({ id: 'qa', revision: 1, name: 'QA', avatar: null,
    models: [{ provider: 'qa-provider', model: 'qa-model' }] });
  const documents = {
    [AVATAR_NAMESPACE]: { document: JSON.stringify(avatar) },
    [PROMPTS_NAMESPACE]: { document: JSON.stringify({ version: 1, rules: [{
      id: 'qa-rule', name: 'QA rule', prompt: 'literal {{provider}}',
      targets: [{ kind: 'persona', personaId: 'qa' },
        { kind: 'model', provider: 'qa-provider', model: 'qa-model' }],
    }] }) },
  };
  root.provide('settings', {
    installSection(_ctx, namespace, _schema, _base, options) {
      options.validate(documents[namespace]);
      options.setSource(() => documents[namespace]);
    },
  });
  root.provide('systemPrompt', {});
  const avatarFiber = root.plugin(avatarHost, {});
  await avatarFiber;
  return { root, avatarFiber, documents };
}

test('Host publishes a callable Persona service through the real Cordis container', async t => {
  const { root } = await fixture(t);
  let service;
  await root.plugin({
    inject: ['dshPersona'],
    apply(ctx) { service = ctx.dshPersona; },
  });
  assert.equal(service.apiVersion, 1);
  assert.equal(service.getSnapshot().library.personas[0].id, 'qa');
  assert.equal(service.resolveModel({ provider: 'qa-provider', model: 'qa-model' }).name, 'QA');
  assert.ok(Object.isFrozen(service.getSnapshot()));
});

test('Host prompts consume the provided service once per rule and unload with it', async t => {
  const { root, avatarFiber } = await fixture(t);
  await root.plugin(promptsHost, {});
  root.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const result = await next();
    return { ...result, variables: { provider: 'qa-provider', model: 'qa-model' } };
  });
  const assemble = () => {
    const assembly = { sections: [], contexts: [], tools: [], variables: {} };
    return root.waterfall('system-prompt/assemble', assembly, { agent: {} },
      () => Promise.resolve(assembly));
  };
  assert.deepEqual((await assemble()).sections, [{
    name: 'dsh-persona:prompt:qa-rule', text: 'literal {{provider}}', interpolate: false,
  }]);
  await avatarFiber.dispose();
  assert.equal(root.get('dshPersona'), undefined);
  assert.deepEqual((await assemble()).sections, []);
});
