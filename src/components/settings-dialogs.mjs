/** Keep Tab within each native dialog, including reverse navigation from its first control. */
export function bindDialogKeyboard(root, signal) {
  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const dialog = event.target.closest('dialog[open]');
    if (!dialog || !root.contains(dialog)) return;
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    const active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !controls.includes(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !controls.includes(active))) {
      event.preventDefault(); first.focus();
    }
  }, { signal });
}
