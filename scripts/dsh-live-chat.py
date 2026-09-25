"""Chat avatars in a running DSH Web client; replies come from scripts/mock-deepseek.mjs.

Set DSH_URL to the address `dsh web` prints, including its token. The profile must have this package installed
and a Persona linked to the model the new session uses (deepseek-official / deepseek-flash by default).
"""
import os
import shutil
import time
from playwright.sync_api import sync_playwright

URL = os.environ['DSH_URL']
MESSAGE = os.environ.get('DSH_MESSAGE', '头像联调')
TIMEOUT = float(os.environ.get('DSH_REPLY_TIMEOUT', '40'))
# The decorator waits for one animation frame; two samples cover that delay.
SAMPLE_MS = 50
GRACE_S = 0.25

TURN = r'''turn => {
  const root = document.querySelector('[data-conversation-scroll]');
  const flows = root ? [...root.querySelectorAll('[data-chat-flow]')].filter(flow => !flow.parentElement.closest('[data-chat-flow]')) : [];
  const rows = flows.flatMap(flow => [...flow.children]).filter(row => row.dataset.chatTurn === String(turn));
  return rows.map(row => ({
    kind: row.dataset.chatFlowKind ?? (row.hasAttribute('data-chat-group-key') ? 'group' : 'unknown'),
    visible: !row.hasAttribute('hidden') && !row.hasAttribute('data-turn-process-hidden') && !row.matches(':empty'),
    role: row.dataset.dspChatRole ?? null,
    lead: row.hasAttribute('data-dsp-chat-lead') ? row.dataset.dspChatName : null,
    text: row.textContent.slice(0, 80),
  }));
}'''


def summary(rows):
    return ' | '.join(f"{row['kind']}{'' if row['visible'] else '(hidden)'}{'*' + row['lead'] if row['lead'] else ''}"
                      for row in rows)


def dismiss(page):
    for name in ['Continue', 'Configure later', '继续', '稍后配置']:
        button = page.get_by_role('button', name=name, exact=True)
        if button.count() and button.first.is_enabled():
            button.first.click()
            page.wait_for_timeout(600)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
        errors = []
        try:
            page = browser.new_page(viewport={'width': 1200, 'height': 900})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(URL)
            page.wait_for_selector('button[aria-label="New session"], button:has-text("New Session")', timeout=30000)
            dismiss(page)
            if page.get_by_role('button', name='Add workspace').count() and page.get_by_text('No sessions yet').count():
                page.get_by_role('button', name='Add workspace').click()
                page.get_by_role('button', name='Open', exact=True).click()
                page.wait_for_timeout(2000)
            page.get_by_role('button', name='New session').first.click()
            composer = page.locator('[contenteditable=true], textarea').first
            composer.click()
            composer.type(MESSAGE)
            page.keyboard.press('Enter')

            page.wait_for_selector('[data-conversation-scroll] [data-chat-flow-kind=user][data-chat-turn]', timeout=15000)
            turn = page.evaluate('''() => Math.max(...[...document.querySelectorAll('[data-chat-flow-kind=user][data-chat-turn]')]
                .map(row => Number(row.dataset.chatTurn)))''')
            start, content_since, timeline, last = time.monotonic(), None, [], None
            while True:
                now = time.monotonic() - start
                rows = page.evaluate(TURN, turn)
                state = summary(rows)
                if state != last:
                    timeline.append(f'{now:6.2f}s  {state}')
                    last = state
                assistant = [row for row in rows if row['kind'] != 'user']
                content = [row for row in assistant if row['visible'] and row['kind'] not in ('turn-process', 'turn-tail')]
                if content and content_since is None:
                    content_since = now
                if content_since is not None and now - content_since > GRACE_S:
                    leads = [row for row in assistant if row['lead']]
                    assert len(leads) == 1, f'expected one assistant avatar in turn {turn}, got {len(leads)}\n' + '\n'.join(timeline)
                if any(row['kind'] == 'turn-tail' for row in rows) and '回复片段 5' in ''.join(row['text'] for row in rows):
                    break
                assert now < TIMEOUT, 'reply did not finish; is DSH using the mock endpoint?\n' + '\n'.join(timeline)
                page.wait_for_timeout(SAMPLE_MS)
            page.wait_for_timeout(300)
            rows = page.evaluate(TURN, turn)
            user = [row for row in rows if row['kind'] == 'user']
            assert user and user[0]['lead'], 'the user message has no identity'
            leads = [row for row in rows if row['kind'] != 'user' and row['lead']]
            assert len(leads) == 1, summary(rows)
            response = [row for row in rows if row['kind'] == 'assistant-step']
            assert response and all(row['role'] == 'assistant' for row in response), summary(rows)
            assert not errors, errors
            print('\n'.join(timeline))
            print(f'PASS: turn {turn} shows one assistant avatar from its first visible content to the finished reply '
                  f'({leads[0]["lead"]} on {leads[0]["kind"]}).')
        finally:
            browser.close()


if __name__ == '__main__':
    run()
