"""Actual prompt component with in-memory sources; no DSH Host or model provider."""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'preview/prompts-test.html').read_text()
checks = []
def passed(name):
    checks.append(name)
    print('PASS:', name, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 1050})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML)
    assert page.locator('.dsp-prompts-empty').is_visible()
    assert page.locator('.dsp-save').count() == 0
    assert page.locator('.dsp-save-status').inner_text() == '修改会自动保存'
    passed('Fresh settings contain no prompt presets and no manual save control')

    page.click('[data-action=new]')
    page.fill('[data-control=name]', '输出约定')
    page.locator('[data-target]').first.check()
    page.click('[data-kind=model]')
    page.locator('[data-target]').first.check()
    page.fill('[data-control=prompt]', '优先使用中文回答。\n保留代码中的 {{variable}}，不替换它。')
    assert page.locator('.dsp-prompts-selected-count').inner_text() == '1 个 Persona 组 · 1 个原生模型'
    page.wait_for_function("document.querySelector('.dsp-save-status').textContent === '已自动保存'")
    saved = page.evaluate('JSON.parse(promptFixture.prompts.getSnapshot().value.document)')
    assert [t['kind'] for t in saved['rules'][0]['targets']] == ['persona', 'model']
    assert '{{variable}}' in saved['rules'][0]['prompt']
    passed('Group and native-model targets share one saved rule')

    page.click('[data-action=new]')
    page.fill('[data-control=name]', '检查输出')
    page.locator('[data-target]').last.check()
    page.fill('[data-control=prompt]', '输出结果前检查单位、路径和示例是否一致。')
    page.click('[data-action=up]')
    assert page.locator('.dsp-prompts-rule strong').first.inner_text() == '检查输出'
    page.wait_for_function("document.querySelector('.dsp-save-status').textContent === '已自动保存'")
    page.evaluate('promptFixture.reopen()')
    assert page.locator('.dsp-prompts-rule strong').first.inner_text() == '检查输出'
    passed('Multiple rules keep their chosen order after reopening')

    page.fill('[data-control=prompt]', '</textarea><img src=x onerror=alert(1)> {{literal}}')
    assert page.locator('#fixture img').count() == 0
    assert page.locator('[data-control=prompt]').evaluate('(n) => document.activeElement === n')
    page.evaluate('promptFixture.reopen()')
    assert page.locator('[data-control=prompt]').input_value() == '</textarea><img src=x onerror=alert(1)> {{literal}}'
    page.wait_for_function("document.querySelector('.dsp-save-status').textContent === '已自动保存'")
    passed('Prompt content stays literal and a view remount keeps the pending automatic draft')

    page.fill('[data-control=prompt]', '')
    assert page.locator('.dsp-prompts-validation').is_visible()
    page.evaluate('promptFixture.prompts.fail(true)')
    page.fill('[data-control=prompt]', '保存失败时保留这段。')
    page.wait_for_function("document.querySelector('.dsp-prompts-validation')?.textContent.includes('保存失败')")
    assert page.locator('[data-action=retrySave]').is_visible()
    assert page.locator('[data-control=prompt]').input_value() == '保存失败时保留这段。'
    page.evaluate('promptFixture.prompts.fail(false)')
    page.click('[data-action=retrySave]')
    page.wait_for_function("document.querySelector('.dsp-save-status').textContent === '已自动保存'")
    passed('Validation and failed automatic persistence retain entered text')

    page.fill('[data-control=prompt]', '准备冲突')
    page.evaluate('''() => { const v=JSON.parse(promptFixture.prompts.getSnapshot().value.document);v.rules[0].prompt='远端更新';promptFixture.prompts.change(v); }''')
    assert page.locator('.dsp-conflict').is_visible()
    page.click('[data-action=reload]')
    assert page.locator('[data-control=prompt]').input_value() == '远端更新'
    passed('Revision conflicts require explicit reload')

    page.locator('.dsp-prompts-rule').nth(1).click()
    page.click('[data-action=toggleTargets]')
    page.click('[data-kind=persona]')
    page.evaluate('''() => {const v=JSON.parse(promptFixture.personas.getSnapshot().value.document);v.library.personas=[];promptFixture.personas.change(v);}''')
    assert page.locator('.dsp-prompts-target-warning').is_visible()
    assert page.locator('[data-target]:checked').count() == 1
    assert page.locator('[data-target]:checked').is_enabled()
    passed('Deleted groups remain visible and removable without name-based reassignment')

    page.click('[data-action=delete]')
    assert page.locator('.dsp-prompts-delete[open]').count() == 1
    page.keyboard.press('Escape')
    assert page.locator('.dsp-prompts-rule').count() == 2
    passed('Deleting a rule requires confirmation')

    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ROOT/'preview/prompts-mobile.png'), full_page=True)
    passed('320px and 390px layouts have no horizontal overflow')

    page.set_content(HTML)
    page.click('[data-action=new]')
    page.fill('[data-control=name]', '输出约定')
    page.locator('[data-target]').first.check()
    page.fill('[data-control=prompt]', '优先使用中文回答。\n\n涉及代码时保留原始变量名，示例中保留 {{variable}}。\n\n必要时列出假设，并说明需要补充的信息。')
    page.wait_for_function("document.querySelector('.dsp-save-status').textContent === '已自动保存'")
    page.set_viewport_size({'width': 1280, 'height': 1050})
    page.screenshot(path=str(ROOT/'preview/prompts-desktop.png'), full_page=True)
    page.evaluate("document.documentElement.dataset.theme='light'")
    page.screenshot(path=str(ROOT/'preview/prompts-light.png'), full_page=True)
    passed('Native-style controls render in both themes')

    page.evaluate('promptFixture.prompts.unavailable()')
    assert page.locator('.dsp-prompts-unavailable').is_visible()
    assert not page.locator('.dsp-prompts-content').is_visible()
    page.evaluate('promptFixture.dispose()')
    assert page.locator('#fixture > *').count() == 0
    assert not errors, errors
    passed('Disabled component and unmount remove editable controls without browser errors')
    browser.close()
print(f'{len(checks)} prompt browser checks passed.')
