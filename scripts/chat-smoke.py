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
<div data-chat-flow-key="u1" data-chat-node-key="u1" data-chat-flow-kind="user" data-chat-turn="1">测试用户消息</div>
<div data-chat-flow-key="tp1" data-chat-node-key="tp1" data-chat-flow-kind="turn-process" data-chat-turn="1"><button>深度求索中</button></div>
<div data-chat-group-key='["process","a1","reasoning"]' data-chat-flow-key='["process","a1","reasoning"]' data-chat-turn="1" data-step-process>
<div data-step-process-body><div data-step-process-content data-chat-flow="">
<div data-chat-flow-key='["a1","reasoning"]' data-chat-node-key="a1" data-chat-group-part="reasoning"
  data-chat-flow-kind="assistant-step" data-chat-turn="1"><p>思考过程</p></div>
</div></div></div>
<div data-chat-flow-key="a1" data-chat-node-key="a1" data-chat-group-part="response" data-chat-flow-kind="assistant-step" data-chat-turn="1"><details>
<summary>显示更多内容</summary><p>完整回复</p></details></div>
<div data-chat-flow-key="tt1" data-chat-node-key="tt1" data-chat-flow-kind="turn-tail" data-chat-turn="1"></div>
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
nodes.set('tp1', { key: 'tp1', kind: 'turn-process', anchorSeq: 9.9, data: {} });
const chat = source({ order: ['u1', 'tp1', 'a1', 'tt1'], nodes });
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
                lead = page.locator('[data-chat-turn="1"][data-dsp-chat-role=assistant][data-dsp-chat-lead]')
                return lead.get_attribute('data-dsp-chat-name') if lead.count() else None

            def lead():
                return page.evaluate('fixture.root.querySelector("[data-dsp-chat-role=assistant][data-dsp-chat-lead]")?.dataset.chatFlowKey ?? null')

            settle()
            assert page.locator('[data-chat-flow-key=u1]').get_attribute('data-dsp-chat-name') == '测试用户'
            assert name() is None
            check('Unknown assistant route leaves the host rows alone and preserves user identity')

            # A partial record becomes attributable without changing the list or model source.
            page.evaluate('fixture.nodes.set("a1", fixture.node(20, fixture.route))')
            settle()
            assert name() == 'Agent A', f'Late node update lost: expected Agent A, got {name()!r}'
            status = page.locator('[data-chat-flow-key=tp1]')
            page.wait_for_function('document.querySelector("[data-chat-flow-key=tp1]").hasAttribute("data-dsp-chat-image")')
            assert status.evaluate('(row) => getComputedStyle(row, "::after").content') == '"Agent A"'
            check('A node-only model update puts the name and decoded avatar on the Turn status row')

            reasoning = page.locator('[data-chat-group-part=reasoning]')
            assert reasoning.get_attribute('data-dsp-chat-role') is None
            response = page.locator('[data-chat-flow-key=a1]')
            assert response.get_attribute('data-dsp-chat-role') == 'assistant'
            assert response.get_attribute('data-dsp-chat-lead') is None
            assert response.evaluate('(row) => [getComputedStyle(row, "::before").content, getComputedStyle(row).paddingLeft]') == ['none', '52px']
            assert page.evaluate('fixture.nodes.source("a1").listeners.size') == 1
            check('The process group and response align under one avatar; the nested reasoning part stays native')

            tail = page.locator('[data-chat-flow-key=tt1]')
            assert tail.get_attribute('data-dsp-chat-role') == 'assistant'
            assert tail.evaluate('(row) => [getComputedStyle(row, "::before").content, getComputedStyle(row).paddingLeft]') == ['none', '0px']
            page.evaluate('fixture.root.querySelector("[data-chat-flow-key=tp1]").replaceChildren()')
            settle()
            assert lead() == '["process","a1","reasoning"]', lead()
            page.evaluate('fixture.root.querySelector("[data-chat-flow-key=tp1]").innerHTML = "<button>深度求索中</button>"')
            settle()
            assert lead() == 'tp1', lead()
            check('Empty rows draw nothing and pass the avatar to the next visible row until DSH fills them')

            page.locator('summary').click()
            settle()
            assert name() == 'Agent A'
            assert page.locator('details').get_attribute('open') is not None
            page.locator('summary').click()
            check('Expanding and collapsing long content preserves identity and native controls')

            page.evaluate('''() => {
                for (const key of ['tp1', '["process","a1","reasoning"]']) {
                    const row = fixture.root.querySelector(`[data-chat-flow-key='${key}']`);
                    row.hidden = true; row.dataset.turnProcessHidden = '';
                }
                fixture.nodes.set('a1', fixture.node(20, fixture.otherRoute));
            }''')
            settle()
            assert lead() == 'a1' and name() == 'Agent B', (lead(), name())
            page.evaluate('''() => {
                for (const key of ['tp1', '["process","a1","reasoning"]']) {
                    const row = fixture.root.querySelector(`[data-chat-flow-key='${key}']`);
                    row.hidden = false; delete row.dataset.turnProcessHidden;
                }
            }''')
            settle()
            assert lead() == 'tp1' and name() == 'Agent B', (lead(), name())
            check('Hidden process rows hand the avatar to the response and take it back when shown')

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
            assert page.locator('[data-dsp-chat-role=assistant]').count() == 0
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

            # DSH logs a request header only when the route changes; the next header after a live status row names it.
            page.evaluate('''() => {
                fixture.root.querySelector('[data-chat-flow]').insertAdjacentHTML('beforeend',
                  '<div data-chat-flow-key="u2" data-chat-node-key="u2" data-chat-flow-kind="user" data-chat-turn="2">追问</div>' +
                  '<div data-chat-flow-key="tp2" data-chat-node-key="tp2" data-chat-flow-kind="turn-process" data-chat-turn="2"><button>深度求索中</button></div>');
                fixture.nodes.set('tp2', { key: 'tp2', kind: 'turn-process', anchorSeq: 49.9, data: {} });
            }''')
            settle()
            status2 = page.locator('[data-chat-flow-key=tp2]')
            assert status2.get_attribute('data-dsp-chat-role') is None
            page.evaluate('fixture.models.set([...fixture.models.getSnapshot(), { seq: 50, model: fixture.route }])')
            settle()
            assert status2.get_attribute('data-dsp-chat-name') == 'Agent A'
            assert name() == 'Agent B'
            page.evaluate('''() => {
                fixture.root.querySelector('[data-chat-flow]').insertAdjacentHTML('beforeend',
                  '<div data-chat-flow-key="u3" data-chat-node-key="u3" data-chat-flow-kind="user" data-chat-turn="3">再问</div>' +
                  '<div data-chat-flow-key="tp3" data-chat-node-key="tp3" data-chat-flow-kind="turn-process" data-chat-turn="3"><button>深度求索中</button></div>');
                fixture.nodes.set('tp3', { key: 'tp3', kind: 'turn-process', anchorSeq: 69.9, data: {} });
            }''')
            settle()
            assert status2.get_attribute('data-dsp-chat-role') is None
            page.evaluate('''() => {
                for (const key of ['u2', 'tp2', 'u3', 'tp3']) fixture.root.querySelector(`[data-chat-flow-key=${key}]`).remove();
                fixture.models.set(fixture.models.getSnapshot().slice(0, 2));
            }''')
            settle()
            check('A live Turn shows its avatar from the next request header; an older Turn without steps stays unattributed')

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
                Object.assign(replacement.dataset, { chatFlowKey: 'a1', chatNodeKey: 'a1', chatGroupPart: 'response',
                  chatFlowKind: 'assistant-step', chatTurn: '1' });
                replacement.innerHTML = '<details><summary>显示更多内容</summary><p>完整回复</p></details>';
                fixture.root.querySelector('[data-chat-flow-key=a1]').replaceWith(replacement);
            }''')
            settle()
            assert page.evaluate('fixture.nodes.listenerCount()') == 1
            assert page.locator('[data-chat-flow-key=a1]').get_attribute('data-dsp-chat-role') == 'assistant'
            check('Replacing a row retains one keyed subscription')

            page.evaluate('''() => {
                for (const row of fixture.root.querySelectorAll('[data-chat-node-key=a1]')) row.dataset.chatNodeKey = 'a2';
                fixture.nodes.set('a2', fixture.node(20, fixture.route));
            }''')
            settle()
            assert page.evaluate('fixture.nodes.source("a1").listeners.size') == 0
            assert page.evaluate('fixture.nodes.source("a2").listeners.size') == 1
            assert name() == 'Agent A'
            check('A recycled step releases its old key and follows its new node')

            page.evaluate('''() => {
                fixture.root.querySelector('[data-chat-flow-key=a1]').remove();
                fixture.root.querySelector('[data-step-process]').remove();
            }''')
            settle()
            assert page.evaluate('fixture.nodes.listenerCount()') == 0
            check('Removing the steps detaches their keyed subscriptions')

            page.evaluate('''() => {
                const row = document.createElement('div');
                Object.assign(row.dataset, { chatFlowKind: 'assistant-step', chatFlowKey: 'a1', chatNodeKey: 'a1', chatTurn: '1' });
                row.textContent = '恢复的回复';
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
            assert page.locator('[role=group], [aria-label]').count() == 0
            assert page.locator('[data-dsp-chat-style]').count() == 0
            assert page.evaluate('fixture.settings.listeners.size + fixture.chat.listeners.size + fixture.models.listeners.size') == 0
            check('Disposal removes decoration and subscriptions and ignores late callbacks')
        finally:
            browser.close()
    return checks


if __name__ == '__main__':
    checks = run()
    print(f'{len(checks)} chat checks passed. DSH DOM/source fixtures; no live Host.')
