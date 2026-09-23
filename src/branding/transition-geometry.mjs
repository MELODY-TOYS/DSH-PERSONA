/** Continuous mask geometry in CSS pixels. No sampled images or frame index. */
export const TRANSITION_TIME = Object.freeze({ cover: 300, overlap: 150, reveal: 350, timeout: 1400 });
export const clamp01 = value => Math.max(0, Math.min(1, value));
const n = value => Number(value.toFixed(2));

export function phaseAt(elapsed, arrival = 0) {
  const cover = Math.pow(clamp01(elapsed / TRANSITION_TIME.cover), 1.4);
  const start = Math.max(TRANSITION_TIME.overlap, arrival);
  const t = clamp01((elapsed - start) / TRANSITION_TIME.reveal);
  // The incoming edge cannot overtake the outgoing edge.
  const reveal = Math.min(cover, 1 - Math.pow(1 - t, 3));
  return { cover, reveal, done: t >= 1, timedOut: elapsed >= TRANSITION_TIME.timeout };
}

export function coverRadius(width, height, x, y) {
  return Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
}

/** Five rotating lobes follow the analytic-mask idea in the cited P3R recreation. */
export function waterContour(x, y, radius, progress, shiftX = 0, shiftY = 0) {
  if (radius <= 0) return 'M0 0Z';
  const p = clamp01(progress), points = [];
  for (let i = 0; i < 80; i++) {
    const angle = i / 80 * Math.PI * 2;
    const wave = .068 * Math.sin(5 * (angle - p * .4 * Math.PI)) + .022 * Math.sin(3 * angle + p * 2.8);
    const r = radius * (1 + wave);
    points.push(`${i ? 'L' : 'M'}${n(x + Math.cos(angle) * r - shiftX)} ${n(y + Math.sin(angle) * r - shiftY)}`);
  }
  return points.join(' ') + 'Z';
}

function disc(x, y, r, dx = 0, dy = 0) {
  if (r <= 0) return 'M0 0Z';
  return `M${n(x + r - dx)} ${n(y - dy)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r - dx)} ${n(y - dy)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r - dx)} ${n(y - dy)}Z`;
}

/** Outline of a union, not XOR: overlapping return apertures must not punch a hole. */
export function twinContour(a, b, r1, r2, dx = 0, dy = 0) {
  if (r1 <= 0 && r2 <= 0) return 'M0 0Z';
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d >= r1 + r2) return disc(a.x, a.y, r1, dx, dy) + disc(b.x, b.y, r2, dx, dy);
  if (d <= Math.abs(r1 - r2)) return r1 >= r2 ? disc(a.x, a.y, r1, dx, dy) : disc(b.x, b.y, r2, dx, dy);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d))));
  const beta = Math.acos(Math.max(-1, Math.min(1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d))));
  const p = { x: a.x + Math.cos(angle - alpha) * r1 - dx, y: a.y + Math.sin(angle - alpha) * r1 - dy };
  const q = { x: a.x + Math.cos(angle + alpha) * r1 - dx, y: a.y + Math.sin(angle + alpha) * r1 - dy };
  return `M${n(p.x)} ${n(p.y)}A${n(r1)} ${n(r1)} 0 ${alpha < Math.PI / 2 ? 1 : 0} 0 ${n(q.x)} ${n(q.y)}A${n(r2)} ${n(r2)} 0 ${beta < Math.PI / 2 ? 1 : 0} 0 ${n(p.x)} ${n(p.y)}Z`;
}

export function maskGeometry(width, height, anchor, direction, progress, dx = 0, dy = 0) {
  const x = anchor.x * width, y = anchor.y * height, p = clamp01(progress);
  if (direction === 'back') {
    const a = { x, y }, b = { x: width * .76, y: height * .62 };
    const radius = coverRadius(width, height, a.x, a.y) * 1.02 * p;
    return twinContour(a, b, radius, radius * .8, dx, dy);
  }
  return waterContour(x, y, coverRadius(width, height, x, y) * 1.12 * p, p, dx, dy);
}

export function rectanglePath(width, height) { return `M0 0H${n(width)}V${n(height)}H0Z`; }
export function cssPath(path) { return `path(evenodd, "${path}")`; }
