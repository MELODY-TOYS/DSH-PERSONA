"""Sidebar account picture with a Persona settings fixture; no live Host."""
from pathlib import Path
import base64
import json
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<style>
[data-avatar-status] { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: #ddd; }
</style>
<button type="button" aria-haspopup="menu">
  <span data-avatar-status="ready"><img id="host-avatar" alt="" width="24" height="24"></span>
  <span class="label">Host Account</span>
</button>
<script type="module">
import { installAccountAvatar } from '/src/modules/avatar/sidebar/account.mjs';
function source(initial) {
  let value = initial;
  const listeners = new Set();
  return { getSnapshot: () => value, listeners,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of [...listeners]) fn(); } };
}
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 8;
const paint = canvas.getContext('2d');
paint.fillStyle = '#2d6cdf';
paint.fillRect(0, 0, 8, 8);
const avatar = canvas.toDataURL('image/png');
const settings = source({ status: 'ready', value: { document: JSON.stringify({ version: 3,
  user: { name: '测试用户', avatar }, library: { schemaVersion: 2, personas: [] } }) } });
const stop = installAccountAvatar({ configForms: { get: () => settings } });
window.fixture = { settings, stop, avatar, source };
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
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/*', lambda route: route.abort())
            entry = module_url(ROOT / 'src/modules/avatar/sidebar/account.mjs', {})
            page.set_content(HTML.replace('/src/modules/avatar/sidebar/account.mjs', entry))
            page.wait_for_function('Boolean(window.fixture)')

            def settle():
                page.evaluate('''() => new Promise(resolve => requestAnimationFrame(() =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))))''')
                assert not errors, errors

            def check(name):
                checks.append(name)
                print('PASS:', name, flush=True)

            settle()
            assert page.evaluate('document.documentElement.hasAttribute("data-dsp-account-avatar")')
            image = page.evaluate('''() => {
                const span = document.querySelector('[data-avatar-status]');
                return [getComputedStyle(span, '::before').backgroundImage,
                        getComputedStyle(span.firstElementChild).opacity];
            }''')
            assert page.evaluate('fixture.avatar') in image[0], image
            assert image[1] == '0', image
            check('Installing the module paints the Persona picture over the host account avatar')

            page.evaluate('''() => fixture.settings.set({ status: 'ready', value: { document: JSON.stringify({
                version: 3, user: { name: '测试用户', avatar: null }, library: { schemaVersion: 2, personas: [] } }) } })''')
            settle()
            assert not page.evaluate('document.documentElement.hasAttribute("data-dsp-account-avatar")')
            assert page.evaluate('getComputedStyle(document.querySelector("[data-avatar-status]").firstElementChild).opacity') == '1'
            check('Clearing the Persona picture restores the host avatar')

            page.evaluate('''() => fixture.settings.set({ status: 'ready', value: { document: JSON.stringify({
                version: 3, user: { name: '测试用户', avatar: window.fixture.avatar }, library: { schemaVersion: 2, personas: [] } }) } })''')
            settle()
            assert page.evaluate('document.documentElement.hasAttribute("data-dsp-account-avatar")')
            page.evaluate('fixture.settings.set({ status: "loading" })')
            settle()
            assert not page.evaluate('document.documentElement.hasAttribute("data-dsp-account-avatar")')
            check('A form that leaves ready clears the replacement')

            page.evaluate('''() => fixture.settings.set({ status: 'ready', value: { document: JSON.stringify({
                version: 3, user: { name: '测试用户', avatar: window.fixture.avatar }, library: { schemaVersion: 2, personas: [] } }) } })''')
            settle()
            page.evaluate('fixture.stop()')
            settle()
            assert not page.evaluate('document.documentElement.hasAttribute("data-dsp-account-avatar")')
            assert page.evaluate('document.querySelectorAll("style[data-dsp-account-style]").length') == 0
            assert page.evaluate('getComputedStyle(document.querySelector("[data-avatar-status]").firstElementChild).opacity') == '1'
            check('Disposal removes the style and restores the host avatar')
        finally:
            browser.close()
    print(f'{len(checks)} account checks passed. DSH DOM fixture; no live Host.')
    return checks


if __name__ == '__main__':
    run()
