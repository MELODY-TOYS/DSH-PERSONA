"""Local settings-page smoke test. This does not run a DSH host."""
from pathlib import Path
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
report = {'environment': 'Chromium about:blank; standalone settings preview; no DSH host', 'checks': []}

def check(name):
    report['checks'].append({'name': name, 'passed': True})
    print('PASS:', name, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: requests.append(r.url))
    page.set_content((ROOT / 'preview/standalone.html').read_text())
    page.click('#open-persona')
    page.wait_for_selector('.dsh-persona-settings')

    assert page.locator('[data-control=enabled]').count() == 0
    assert page.locator('[data-control=showUser]').count() == 0
    assert page.locator('[data-control=showAssistant]').count() == 0
    assert page.locator('[data-control=showNames]').count() == 0
    assert page.locator('[data-control=size]').count() == 0
    check('Installed plugin has no display toggle or avatar-size control')

    assert page.locator('.dsp-chat-preview').is_visible()
    page.locator('.dsp-preview-seek').fill('1000')
    assert page.locator('.dsp-preview-user').count() == 1
    user_text = page.locator('.dsp-preview-user .dsp-preview-bubble').inner_text()
    assert user_text in {'@所有人 10点周会', '@所有人 这周自愿加班到8点', '@所有人 这周五聚餐'}
    check('User preview chooses one configured sample message')

    page.click('[data-action=new]')
    page.fill('[data-control=name]', 'DeepSeek')
    page.locator('.dsp-preview-seek').fill('1000')
    page.wait_for_selector('.dsp-preview-assistant')
    assert page.locator('.dsp-preview-assistant .dsp-preview-bubble').inner_text().startswith('收到')
    assert page.locator('.dsp-preview-assistant strong').inner_text() == 'DeepSeek'
    check('Persona preview uses the selected identity and completed simulated reply')

    page.set_viewport_size({'width': 390, 'height': 844})
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    check('Settings layout stays within a narrow viewport')

    assert not errors, errors
    assert not [url for url in requests if url.startswith(('http:', 'https:'))], requests
    check('Settings preview raises no browser exception or external request')
    browser.close()

(ROOT / 'docs/browser-smoke-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f"{len(report['checks'])} settings checks passed.")
