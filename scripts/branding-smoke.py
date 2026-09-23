"""Pinned alpha.2 icon-seat smoke test. This does not run a DSH host."""
from pathlib import Path
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
report = {'environment': 'Chromium about:blank; standalone preview and alpha.2 icon-seat DOM fixtures; no DSH host', 'checks': []}

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
    page.wait_for_selector('style[data-dsh-persona-brand]', state='attached')

    card = page.locator('[data-plugin-package="dsh-persona"] > div > span[aria-hidden]')
    assert card.evaluate('(n) => getComputedStyle(n).backgroundImage.includes("data:image/avif;base64,")')
    assert card.locator('svg').evaluate('(n) => getComputedStyle(n).opacity') == '0'
    check('Installed card uses the project artwork in the pinned icon seat')

    page.click('#open-persona')
    detail = page.locator('[data-plugin-detail="dsh-persona"] > div:first-of-type > span[aria-hidden]')
    assert detail.evaluate('(n) => getComputedStyle(n).backgroundImage') == card.evaluate('(n) => getComputedStyle(n).backgroundImage')
    assert page.locator('[data-dsp-brand-cover]').count() == 0
    assert page.get_by_text('查看全图').count() == 0
    check('Detail page keeps the icon but does not insert a banner or full-artwork control')

    background = page.locator('[data-dso-host]')
    assert background.count() == 1
    video = background.locator('video.dso-video')
    assert video.get_attribute('src').startswith('data:video/mp4;base64,')
    assert video.evaluate('(v) => [v.loop, v.muted, v.controls]') == [True, True, False]
    assert page.locator('.dso-layer[aria-hidden="true"]').count() == 1
    check('Detail background is fixed by the design and exposes no user controls')

    assert page.locator('.dsp-persona-item').count() == 0
    assert page.locator('[data-avatar=user] img').count() == 0
    check('Project artwork does not populate user or Persona avatars')

    page.uncheck('#plugin-on')
    assert page.locator('style[data-dsh-persona-brand]').count() == 0
    assert page.locator('[data-dsp-detail-background-layer]').count() == 0
    assert detail.locator('svg').evaluate('(n) => getComputedStyle(n).opacity') == '1'
    page.check('#plugin-on')
    page.wait_for_selector('style[data-dsh-persona-brand]', state='attached')
    check('Disable restores the host icon and enable reinstalls one scoped style')

    assert not errors, errors
    assert not [url for url in requests if url.startswith(('http:', 'https:'))], requests
    check('Brand icon adaptation makes no external request or browser exception')
    browser.close()

(ROOT / 'docs/branding-smoke-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f"{len(report['checks'])} branding checks passed.")
