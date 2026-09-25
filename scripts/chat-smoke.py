"""Chat decoration with DSH DOM and keyed source fixtures; no live Host."""
from pathlib import Path
import base64
import re
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<style>
body { font-family: sans-serif; margin: 24px; }
[data-conversation-scroll] { max-width: 760px; }
[data-chat-flow] > div { margin: 24px 0; }
[data-turn-process-hidden] { display: none; }
</style>
<div data-conversation-scroll><div data-chat-flow>
<div data-chat-flow-key="u1" data-chat-node-key="u1" data-chat-flow-kind="user">测试用户消息</div>
<div data-chat-group-key='["process","a1","reasoning"]' data-chat-flow-key='["process","a1","reasoning"]' data-step-process>
<div data-step-process-body><div data-step-process-content data-chat-flow="">
<div data-chat-flow-key='["a1","reasoning"]' data-chat-node-key="a1" data-chat-group-part="reasoning"
  data-chat-flow-kind="assistant-step"><p>思考过程</p></div>
</div></div></div>
<div data-chat-flow-key="a1" data-chat-node-key="a1" data-chat-group-part="response" data-chat-flow-kind="assistant-step"><details>
<summary>显示更多内容</summary><p>完整回复</p></details></div>
<div data-chat-flow-key="a0" data-chat-node-key="a0" data-chat-group-part="response" data-chat-flow-kind="assistant-step"></div>
</div></div>
<script type="module">
import { decorateChat } from '/src/modules/avatar/chat/decorate.mjs';
function source(initial) {
  let value = initial;
  const listeners = new Set();
  return { getSnapshot: () => value, listeners,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of [...listeners]) fn(); } };
}
// ChatSnapshot.order and the outer source can stay unchanged on a node-only update.
// See dsh-v0.1.7-rc.2 ui-chat/conversation-nodes/chat-snapshot-builder.ts.
function nodeStore() {
  const sources = new Map();
  const getSource = key => {
    if (!sources.has(key)) sources.set(key, source(undefined));
    return sources.get(key);
  };
  return { get: key => getSource(key).getSnapshot(), source: getSource,
    set: (key, node) => getSource(key).set(node),
    listenerCount: () => [...sources.values()].reduce((n, s) => n + s.listeners.size, 0) };
}
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 8;
canvas.getContext('2d').fillRect(0, 0, 8, 8);
const avatar = canvas.toDataURL('image/png');
const route = { provider: 'test', model: 'a' }, otherRoute = { provider: 'test', model: 'b' };
const settings = source({ status: 'ready', value: { document: JSON.stringify({ version: 3,
  user: { name: '测试用户', avatar }, library: { schemaVersion: 2, personas: [
    { id: 'pa', revision: 1, name: 'Agent A', avatar, models: [route] },
    { id: 'pb', revision: 1, name: 'Agent B', avatar, models: [otherRoute] },
  ] } }) } });
const nodes = nodeStore();
const node = (seq, finalRoute) => ({ key: 'a1', kind: 'assistant-step', anchorSeq: seq,
  data: finalRoute ? { finalNode: { requestConfig: finalRoute } } : {} });
nodes.set('a1', node(20));
nodes.set('a0', { ...node(20, route), key: 'a0' });
const chat = source({ order: ['u1', 'a1', 'a0'], nodes });
const models = source([]);
const root = document.querySelector('[data-conversation-scroll]');
const stop = decorateChat(root, { settings, chat, models });
window.fixture = { nodes, node, nodeStore, chat, models, route, otherRoute, stop, root, settings,
  scans: 0 };
const query = root.querySelectorAll.bind(root);
root.querySelectorAll = (...args) => { window.fixture.scans++; return query(...args); };
</script></html>'''


def module_url(path, cache):
    path = path.resolve()
    if path in cache:
        return cache[path]
    if not path.is_relative_to(ROOT / 'src') or path.suffix not in {'.mjs', '.css'}:
        raise ValueError(f'Unexpected module: {path}')
    content = path.read_text(encoding='utf-8')
    if path.suffix == '.css':
        content = 'export default ' + json.dumps(content) + ';'
    else:
        def imported(match):
            target = (path.parent / match.group(1)).resolve()
            return "from '" + module_url(target, cache) + "'"
        content = re.sub(r"from ['\"](\.[^'\"]+)['\"]", imported, content)
    result = 'data:text/javascript;base64,' + base64.b64encode(content.encode()).decode()
    cache[path] = result
    return result


def run():
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
        try:
            page = browser.new_page(viewport={'width': 1000, 'height': 720})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/*', lambda route: route.abort())
            entry = module_url(ROOT / 'src/modules/avatar/chat/decorate.mjs', {})
            page.set_content(HTML.replace('/src/modules/avatar/chat/decorate.mjs', entry))
            page.wait_for_function('Boolean(window.fixture)')

            def settle():
                # Drain observer delivery and owned rendering; do not guess elapsed milliseconds.
                page.evaluate('''() => new Promise(resolve => requestAnimationFrame(() =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))))''')
                assert not errors, errors

            def check(name):
                checks.append(name)
                print('PASS:', name, flush=True)

            def name():
                return page.locator('[data-chat-flow-key=a1]').get_attribute('data-dsp-chat-name')

            settle()
            assert page.locator('[data-chat-flow-key=u1]').get_attribute('data-dsp-chat-name') == '测试用户'
            assert name() is None
            check('Unknown assistant route leaves the host row alone and preserves user identity')

            # A partial record becomes attributable without changing the list or model source.
            page.evaluate('fixture.nodes.set("a1", fixture.node(20, fixture.route))')
            settle()
            assert name() == 'Agent A', f'Late node update lost: expected Agent A, got {name()!r}'
            page.wait_for_function('document.querySelector("[data-chat-flow-key=a1]").hasAttribute("data-dsp-chat-image")')
            assert page.locator('[data-chat-flow-key=a1]').evaluate('(row) => getComputedStyle(row, "::after").content') == '"Agent A"'
            check('A node-only model update restores the name and decoded avatar')

            reasoning = page.locator('[data-chat-group-part=reasoning]')
            assert reasoning.get_attribute('data-dsp-chat-role') is None
            assert page.evaluate('fixture.nodes.source("a1").listeners.size') == 1
            check('A process group keeps its reasoning part native while the response part carries the identity')

            empty = page.locator('[data-chat-flow-key=a0]')
            assert empty.get_attribute('data-dsp-chat-name') == 'Agent A'
            assert empty.evaluate('(row) => [getComputedStyle(row, "::before").content, getComputedStyle(row).paddingLeft]') == ['none', '0px']
            empty.evaluate('(row) => row.remove()')
            settle()
            assert page.evaluate('fixture.nodes.source("a0").listeners.size') == 0
            check('An empty response seat draws no avatar')

            page.locator('summary').click()
            settle()
            assert name() == 'Agent A'
            assert page.locator('details').get_attribute('open') is not None
            page.locator('summary').click()
            check('Expanding and collapsing long content preserves identity and native controls')

            page.evaluate('''() => {
                const row = document.querySelector('[data-chat-flow-key=a1]');
                row.hidden = true; row.dataset.turnProcessHidden = '';
                fixture.nodes.set('a1', fixture.node(20, fixture.otherRoute));
            }''')
            settle()
            page.evaluate('''() => {
                const row = document.querySelector('[data-chat-flow-key=a1]');
                row.hidden = false; delete row.dataset.turnProcessHidden;
            }''')
            settle()
            assert name() == 'Agent B'
            check('Hidden process rows pick up model changes before being shown again')

            before = page.evaluate('fixture.scans')
            page.evaluate('''() => {
                for (let n = 0; n < 50; n++) {
                    const next = fixture.node(20, fixture.otherRoute);
                    next.data.blocks = [{ kind: 'text', text: '流式回复' + n }];
                    fixture.nodes.set('a1', next);
                }
            }''')
            settle()
            assert page.evaluate('fixture.scans') == before
            check('Text-only streaming updates do not rescan the transcript')

            page.evaluate('fixture.nodes.set("a1", fixture.node(20, { provider: "test", model: "unassigned" }))')
            settle()
            assert name() is None
            check('A route without a Persona removes a stale identity')

            # No final requestConfig: the observed anchor changes its preceding request header.
            page.evaluate('''() => {
                fixture.models.set([{ seq: 10, model: fixture.route }, { seq: 30, model: fixture.otherRoute }]);
                fixture.nodes.set('a1', fixture.node(20));
            }''')
            settle()
            assert name() == 'Agent A'
            page.evaluate('fixture.nodes.set("a1", fixture.node(40))')
            settle()
            assert name() == 'Agent B'
            check('Anchor-only settlement updates exact request-header attribution')

            page.evaluate('''() => {
                fixture.previousNodes = fixture.nodes;
                fixture.nodes = fixture.nodeStore();
                fixture.nodes.set('a1', fixture.node(20, fixture.route));
                fixture.chat.set({ ...fixture.chat.getSnapshot(), nodes: fixture.nodes });
            }''')
            settle()
            assert name() == 'Agent A'
            assert page.evaluate('fixture.previousNodes.listenerCount()') == 0
            assert page.evaluate('fixture.nodes.listenerCount()') == 1
            page.evaluate('fixture.nodes.set("a1", fixture.node(40))')
            settle()
            assert name() == 'Agent B'
            check('Replacing the keyed store with the same list rebinds subscriptions')

            page.evaluate('''() => {
                const replacement = document.createElement('div');
                replacement.dataset.chatFlowKey = 'a1';
                replacement.dataset.chatNodeKey = 'a1';
                replacement.dataset.chatGroupPart = 'response';
                replacement.dataset.chatFlowKind = 'assistant-step';
                replacement.innerHTML = '<details><summary>显示更多内容</summary><p>完整回复</p></details>';
                fixture.root.querySelector('[data-chat-flow-key=a1]').replaceWith(replacement);
            }''')
            settle()
            assert page.evaluate('fixture.nodes.listenerCount()') == 1
            check('Replacing a row retains one keyed subscription')

            page.evaluate('''() => {
                const row = fixture.root.querySelector('[data-chat-flow-key=a1]');
                row.dataset.chatFlowKey = 'a2'; row.dataset.chatNodeKey = 'a2';
                fixture.nodes.set('a2', fixture.node(20, fixture.route));
            }''')
            settle()
            assert page.evaluate('fixture.nodes.source("a1").listeners.size') == 0
            assert page.evaluate('fixture.nodes.source("a2").listeners.size') == 1
            assert page.locator('[data-chat-flow-key=a2]').get_attribute('data-dsp-chat-name') == 'Agent A'
            check('A recycled row releases its old key and follows its new node')

            page.evaluate('fixture.root.querySelector("[data-chat-flow-key=a2]").remove()')
            settle()
            assert page.evaluate('fixture.nodes.listenerCount()') == 0
            check('Removing a row detaches its keyed subscription')

            page.evaluate('''() => {
                const row = document.createElement('div');
                row.dataset.chatFlowKind = 'assistant-step'; row.dataset.chatFlowKey = 'a1'; row.dataset.chatNodeKey = 'a1';
                fixture.root.querySelector('[data-chat-flow]').append(row);
            }''')
            settle()
            assert name() == 'Agent B'
            page.evaluate('''() => {
                fixture.late = [...fixture.nodes.source('a1').listeners];
                fixture.nodes.set('a1', fixture.node(20, fixture.route));
                fixture.stop(); fixture.stop();
                for (const callback of fixture.late) callback();
            }''')
            settle()
            assert page.evaluate('fixture.nodes.listenerCount()') == 0
            assert page.locator('[data-dsp-chat-role]').count() == 0
            assert page.locator('[data-dsp-chat-style]').count() == 0
            assert page.evaluate('fixture.settings.listeners.size + fixture.chat.listeners.size + fixture.models.listeners.size') == 0
            check('Disposal removes decoration and subscriptions and ignores late callbacks')
        finally:
            browser.close()
    return checks


if __name__ == '__main__':
    checks = run()
    print(f'{len(checks)} chat checks passed. DSH DOM/source fixtures; no live Host.')
