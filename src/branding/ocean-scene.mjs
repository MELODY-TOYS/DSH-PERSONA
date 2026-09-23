/** Continuous underwater ambience: light shafts, suspended motes and sparse bubbles. */
export function createOceanScene(layer, preference) {
  const doc = layer.ownerDocument, win = doc.defaultView, abort = new AbortController();
  const canvas = doc.createElement('canvas'); canvas.className = 'dso-water';
  canvas.dataset.renderer = 'continuous-2d'; canvas.setAttribute('aria-hidden', 'true'); layer.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { focus() {}, transition() {}, resize() {}, dispose() { canvas.remove(); } };
  let raf = 0, previous = null, elapsed = 0, destroyed = false, width = 1, height = 1, ratio = .6;
  let aim = { x: .72, y: .24 }, light = { ...aim }, activity = 0, wake = 0, beamInk;
  const motes = Array.from({ length: 38 }, (_, i) => ({
    x: ((i * 61 + 17) % 101) / 101, y: ((i * 43 + 7) % 97) / 97,
    speed: .006 + (i % 7) * .0018, size: .45 + (i % 4) * .28, phase: (i * 1.73) % 6.28,
  }));
  const ambientBubbles = Array.from({ length: 9 }, (_, i) => ({
    x: ((i * 37 + 19) % 89) / 89, y: ((i * 53 + 13) % 83) / 83,
    speed: .004 + (i % 4) * .0014, size: 2.2 + (i % 5) * .75, phase: i * .83,
  }));

  function resize() {
    const w = Math.max(1, layer.clientWidth), h = Math.max(1, layer.clientHeight);
    if (w === width && h === height) return;
    width = w; height = h;
    ratio = Math.min(.72, 900 / width, 680 / height);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    beamInk = ctx.createLinearGradient(0, 0, 0, height);
    beamInk.addColorStop(0, 'rgba(158,235,255,.06)'); beamInk.addColorStop(.7, 'rgba(83,185,239,.012)'); beamInk.addColorStop(1, 'rgba(60,173,246,0)');
    draw(0);
  }

  function softGlow(x, y, radius, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(91,211,255,${alpha})`); g.addColorStop(.35, `rgba(51,155,230,${alpha * .42})`); g.addColorStop(1, 'rgba(0,45,95,0)');
    ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    const follow = 1 - Math.exp(-dt * 6.5);
    light.x += (aim.x - light.x) * follow; light.y += (aim.y - light.y) * follow;
    wake += (activity - wake) * (1 - Math.exp(-dt * 5.4));

    softGlow(light.x * width, light.y * height, width * .46, .085 + wake * .035);
    softGlow(width * (.35 + Math.sin(elapsed * .08) * .025), height * .72, width * .34, .035);

    ctx.fillStyle = beamInk;
    for (let i = 0; i < 4; i++) {
      const top = width * (.56 + i * .12) + Math.sin(elapsed * .14 + i * .9) * 22;
      const sway = Math.sin(elapsed * .11 + i * 1.2) * 18;
      ctx.beginPath(); ctx.moveTo(top, 0); ctx.lineTo(top + 14, 0);
      ctx.lineTo(top - width * .17 + 58 + sway, height); ctx.lineTo(top - width * .17 - 62 + sway, height); ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = 'rgba(205,247,255,.36)';
    ctx.beginPath();
    for (const p of motes) {
      const y = ((p.y - elapsed * p.speed) % 1 + 1) % 1;
      const x = p.x * width + Math.sin(elapsed * .28 + p.phase) * 10;
      ctx.moveTo(x + p.size, y * height); ctx.arc(x, y * height, p.size, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.lineWidth = 1;
    for (const p of ambientBubbles) {
      const y = ((p.y - elapsed * p.speed) % 1 + 1) % 1;
      const x = p.x * width + Math.sin(elapsed * .2 + p.phase) * 14;
      ctx.strokeStyle = 'rgba(190,241,255,.18)';
      ctx.beginPath(); ctx.arc(x, y * height, p.size, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(235,253,255,.16)'; ctx.beginPath(); ctx.arc(x - p.size * .28, y * height - p.size * .32, Math.max(.45, p.size * .16), 0, Math.PI * 2); ctx.fill();
    }
  }

  function tick(now) {
    raf = 0;
    if (destroyed || preference.matches || doc.hidden) return;
    const dt = previous === null ? 0 : Math.min(.1, (now - previous) / 1000);
    previous = now; elapsed += dt; draw(dt); raf = win.requestAnimationFrame(tick);
  }
  function sync() {
    win.cancelAnimationFrame(raf); raf = 0; previous = null;
    if (destroyed) return;
    if (preference.matches) { activity = wake = 0; light = { ...aim }; draw(0); }
    else if (!doc.hidden) raf = win.requestAnimationFrame(tick);
  }
  preference.addEventListener('change', sync, { signal: abort.signal });
  doc.addEventListener('visibilitychange', sync, { signal: abort.signal });
  resize(); sync();
  return {
    focus(x, y) { aim = { x: Math.max(.08, Math.min(.92, x)), y: Math.max(.08, Math.min(.9, y)) }; },
    transition(active = false) { activity = active ? 1 : 0; }, resize,
    dispose() { if (destroyed) return; destroyed = true; abort.abort(); win.cancelAnimationFrame(raf); canvas.remove(); },
  };
}
