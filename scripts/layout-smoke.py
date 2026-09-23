"""Built component views and real controllers with in-memory Host boundaries."""
from pathlib import Path
import json
import shutil
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'preview/layout-test.html').read_text()
checks = []
def passed(name):
    checks.append(name)
    print('PASS:', name, flush=True)

def rendered(page):
    page.wait_for_function("document.querySelectorAll('#fixture *').length > 0")
    page.evaluate('''async () => {
      await Promise.all(document.getAnimations()
        .filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {})));
    }''')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 1050})
    page.set_default_timeout(5000)
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: requests.append(r.url))
    try:
        page.set_content(HTML)
        rendered(page)
        assert page.locator('.dsp-persona-editor > .dsp-preview-section').count() == 1
        a = page.locator('.dsp-ai-identity').bounding_box()
        v = page.locator('.dsp-preview-section').bounding_box()
        m = page.locator('.dsp-model-section').bounding_box()
        assert a['y'] + a['height'] <= m['y']
        assert m['y'] + m['height'] <= v['y']
        expect(page.locator('.dsp-chat-preview')).to_be_visible()
        page.locator('.dsp-preview-seek').fill('1000')
        passed('Model selection precedes the always-visible message preview')

        page.evaluate('''() => {
          const canvas=document.createElement('canvas'); canvas.width=16;canvas.height=16;
          const image=canvas.toDataURL('image/png');
          layoutFixture.avatarController.edit(c=>{c.user.avatar=image;c.library.personas[0].avatar=image});
          window.previewRow=document.querySelector('.dsp-preview-assistant');
          window.previewImage=previewRow.querySelector('img');
          window.fieldImage=document.querySelector('[data-avatar=assistant] img');
          window.previewMutations=[];
          window.previewObserver=new MutationObserver(m=>previewMutations.push(...m));
          previewObserver.observe(document.querySelector('.dsp-preview-messages'), {subtree:true,childList:true,attributes:true,characterData:true});
        }''')
        page.fill('[data-control=search]', '订阅')
        assert page.evaluate('previewMutations.length') == 0
        page.fill('[data-control=name]', 'DeepSeek 编辑')
        assert page.evaluate("previewRow===document.querySelector('.dsp-preview-assistant') && previewImage===previewRow.querySelector('img') && fieldImage===document.querySelector('[data-avatar=assistant] img')")
        expect(page.locator('.dsp-preview-assistant strong')).to_have_text('DeepSeek 编辑')
        assert page.locator('[data-control=name]').evaluate('(n)=>document.activeElement===n')
        page.evaluate('previewObserver.disconnect()')
        passed('Search does not mutate the preview; renaming retains decoded avatar nodes and focus')

        page.evaluate('''() => {
          const input=document.querySelector('[data-control=name]');
          window.nameField=input; input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          input.value='输入中文'; input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'中文'}));
          input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
        }''')
        assert page.locator('[data-control=name]').input_value() == '输入中文'
        assert page.evaluate("nameField===document.querySelector('[data-control=name]') && document.activeElement===nameField")
        passed('Composition events preserve the original input node and entered text')

        page.fill('[data-control=search]', '')
        page.locator('[data-persona=custom]').click()
        rendered(page)
        route = page.locator('[data-route]').first
        route.click()
        expect(page.locator('.dsp-move-dialog')).to_be_visible()
        expect(page.locator('[data-action=moveCancel]')).to_be_focused()
        page.keyboard.press('Shift+Tab')
        expect(page.locator('[data-action=moveApply]')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.locator('[data-route]').first).to_be_focused()
        assert not page.locator('[data-route]').first.is_checked()
        page.locator('[data-route]').first.click()
        page.click('[data-action=moveApply]')
        expect(page.locator('[data-route]').first).to_be_checked()
        expect(page.locator('[data-route]').first).to_be_focused()
        passed('Move confirmation traps focus, cancels cleanly, and restores the replacement checkbox')

        expect(page.locator('.dsp-save-status')).to_have_text('已自动保存', timeout=3000)
        assert page.locator('.dsp-save').count() == 0
        page.evaluate('layoutFixture.avatars.hold(true)')
        page.fill('[data-control=name]', '自动保存第一版')
        expect(page.locator('.dsp-save-status')).to_have_text('正在自动保存…', timeout=3000)
        assert page.locator('[data-control=name]').is_enabled()
        page.fill('[data-control=name]', '自动保存第二版')
        page.evaluate('layoutFixture.avatars.hold(false)')
        expect(page.locator('.dsp-save-status')).to_have_text('已自动保存', timeout=3000)
        assert page.evaluate("JSON.parse(layoutFixture.avatars.getSnapshot().value.document).library.personas.find(p=>p.id==='custom').name") == '自动保存第二版'
        passed('Automatic save keeps editing enabled and serializes a newer in-flight draft')

        page.evaluate('layoutFixture.avatars.fail(true)')
        page.fill('[data-control=name]', '失败时保留')
        expect(page.locator('.dsp-validation')).to_contain_text('保存失败', timeout=3000)
        expect(page.locator('[data-control=name]')).to_have_value('失败时保留')
        expect(page.locator('[data-action=retrySave]')).to_be_visible()
        page.evaluate('layoutFixture.avatars.fail(false)')
        page.click('[data-action=retrySave]')
        expect(page.locator('.dsp-save-status')).to_have_text('已自动保存', timeout=3000)
        page.fill('[data-control=name]', '准备冲突')
        page.evaluate('''() => {const v=JSON.parse(layoutFixture.avatars.getSnapshot().value.document);v.user.name='远端名称';layoutFixture.avatars.change(v)}''')
        expect(page.locator('.dsp-conflict')).to_be_visible()
        page.click('[data-action=reload]')
        expect(page.locator('[data-control=userName]')).to_have_value('远端名称')
        passed('Automatic-save failures retain input, retry explicitly, and conflicts never overwrite remote state')

        page.evaluate('layoutFixture.avatarController.edit(c=>{c.library.personas=[]})')
        page.locator('.dsp-preview-seek').fill('1000')
        assert page.locator('.dsp-empty-preview > .dsp-preview-section').count() == 1
        expect(page.locator('.dsp-preview-user')).to_be_visible()
        expect(page.locator('.dsp-preview-assistant')).to_be_hidden()
        page.click('[data-action=new]')
        page.fill('[data-control=name]', '新建')
        assert page.locator('.dsp-persona-editor > .dsp-preview-section').count() == 1
        passed('Empty-library preview survives deletion and returns to the editor on creation')

        page.click('[data-view=prompts]')
        rendered(page)
        expect(page.locator('#dsp-prompts-target-picker')).to_be_hidden()
        expect(page.locator('.dsp-prompts-selected-count')).to_have_text('1 个 Persona 组 · 2 个原生模型')
        assert page.locator('.dsp-target-tag').count() == 3
        summary = page.locator('.dsp-prompts-summary').inner_text()
        assert 'subscription-a / deepseek' in summary and 'subscription-b / deepseek' in summary
        page.click('[data-action=toggleTargets]')
        expect(page.locator('#dsp-prompts-target-picker')).to_be_visible()
        page.click('[data-kind=model]')
        assert page.locator('[data-target]:checked').count() == 2
        page.click('[data-action=toggleTargets]')
        expect(page.locator('[data-action=toggleTargets]')).to_be_focused()
        assert page.locator('.dsp-target-tag').count() == 3
        passed('Collapsed summary identifies both target kinds and exact model channels')

        page.evaluate('''() => {const value=JSON.parse(layoutFixture.avatars.getSnapshot().value.document);value.library.personas=[];layoutFixture.avatars.change(value)}''')
        expect(page.locator('.dsp-prompts-target-warning')).to_be_visible()
        expect(page.locator('.dsp-target-tag[data-unavailable]')).to_contain_text('deepseek')
        expect(page.locator('#dsp-prompts-target-picker')).to_be_hidden()
        page.click('[data-action=toggleTargets]')
        page.click('[data-kind=persona]')
        expect(page.locator('[data-target]:checked')).to_be_enabled()
        passed('Missing saved targets stay identifiable and removable with a collapsed picker')

        page.click('[data-action=new]')
        expect(page.locator('#dsp-prompts-target-picker')).to_be_visible()
        expect(page.locator('[data-control=name]')).to_be_focused()
        page.fill('[data-control=name]', '新的规则')
        page.click('[data-kind=model]')
        page.locator('[data-target]').first.check()
        page.fill('[data-control=prompt]', '{{literal}}\n按字面保存。')
        page.click('[data-action=toggleTargets]')
        page.fill('[data-control=prompt]', '{{literal}}\n按字面保存并保持收起。')
        expect(page.locator('#dsp-prompts-target-picker')).to_be_hidden()
        expect(page.locator('.dsp-save-status')).to_have_text('已自动保存', timeout=3000)
        page.click('[data-action=up]')
        expect(page.locator('.dsp-save-status')).to_have_text('已自动保存', timeout=3000)
        assert page.locator('.dsp-prompts-rule strong').nth(1).inner_text() == '新的规则'
        passed('New rules open target selection; typing and sorting preserve explicit collapse state')

        page.evaluate('layoutFixture.dispose()')
        page.set_content(HTML); rendered(page)
        for theme in ['light', 'dark']:
            page.evaluate('(t)=>document.documentElement.dataset.theme=t', theme)
            for kind in ['avatar', 'prompts']:
                page.click(f'[data-view={kind}]')
                for width in [320, 390, 519, 520, 521, 599, 600, 601, 759, 760, 761, 960]:
                    # Vary the slot width independently of the browser viewport.
                    page.evaluate('(w)=>{document.querySelector("#fixture").style.width=w+"px"}', width)
                    assert page.locator('#fixture').evaluate('(n)=>n.scrollWidth<=n.clientWidth+1'), (theme, kind, width)
                page.evaluate('document.querySelector("#fixture").style.width=""')
                for width in [320, 390, 768, 1280]:
                    page.set_viewport_size({'width': width, 'height': 1050})
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'), (theme, kind, width)
        passed('Both themes and components fit viewport and independent container breakpoints')

        page.click('[data-view=avatar]')
        page.evaluate("layoutFixture.avatarController.edit(c=>{c.user.name='长名称'.repeat(26);c.library.personas[0].name='LongName'.repeat(10)})")
        page.set_viewport_size({'width': 320, 'height': 900})
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.set_viewport_size({'width': 1280, 'height': 1050})
        passed('Maximum-length names wrap without widening the page')

        touch = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        try:
            touch.set_content(HTML); rendered(touch)
            for kind in ['avatar', 'prompts']:
                touch.click(f'[data-view={kind}]')
                assert touch.locator('.dsp-save').count() == 0
                expect(touch.locator('.dsp-save-status')).to_be_visible()
        finally:
            touch.close()
        passed('Narrow touch layouts expose automatic-save status without a manual save control')

        page.evaluate('layoutFixture.mount("avatar")')
        page.emulate_media(reduced_motion='reduce')
        page.locator('[data-persona]').nth(1).click()
        assert page.locator('.dsp-persona-editor').evaluate('(n)=>n.getAnimations().length') == 0
        page.click('[data-action=delete]')
        assert page.locator('dialog[open]').evaluate('(n)=>n.getAnimations().length') == 0
        page.keyboard.press('Escape')
        expect(page.locator('[data-action=delete]')).to_be_focused()
        page.emulate_media(reduced_motion='no-preference')
        assert page.evaluate('''() => {layoutFixture.avatarController.select('deepseek');layoutFixture.avatarController.select('custom');return document.querySelector('.dsp-persona-editor').getAnimations().length}''') == 1
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('document.querySelector(".dsp-persona-editor").getAnimations().length===0')
        passed('Reduced motion applies initially and cancels an in-flight selection animation')

        page.emulate_media(reduced_motion='no-preference')
        page.evaluate('''() => {
          layoutFixture.avatarController.select('deepseek');layoutFixture.avatarController.select('custom');
          window.leavingEditor=document.querySelector('.dsp-persona-editor');layoutFixture.dispose();
        }''')
        assert page.locator('#fixture > *').count() == 0
        assert page.evaluate('leavingEditor.getAnimations().length') == 0
        passed('Unmount cancels pending animation and removes view-owned nodes')

        page.set_content(HTML); rendered(page)
        page.screenshot(path=str(ROOT/'preview/layout-avatar-desktop.png'), full_page=True)
        page.click('[data-view=prompts]'); rendered(page)
        page.screenshot(path=str(ROOT/'preview/layout-prompts-desktop.png'), full_page=True)
        page.evaluate("document.documentElement.dataset.theme='light'")
        page.screenshot(path=str(ROOT/'preview/layout-prompts-light.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(ROOT/'preview/layout-prompts-mobile.png'), full_page=True)
        assert not errors, errors
        assert not [url for url in requests if url.startswith(('http:', 'https:'))], requests
        passed('Fixture screenshots render with no browser exceptions or remote requests')
    finally:
        browser.close()
(ROOT/'preview/layout-smoke-results.json').write_text(json.dumps({'environment':'Chromium; TypeScript-bundled views with real controllers; in-memory Host scopes; no DSH installation', 'checks':checks}, ensure_ascii=False, indent=2)+'\n')
print(f'{len(checks)} layout browser checks passed.')
