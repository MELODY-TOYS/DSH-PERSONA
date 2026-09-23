export function createLowBubbles(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  let width = 1, height = 1;
  function ring(r, start, end, color, line = 1) {
    ctx.beginPath(); ctx.arc(0, 0, r, start, end); ctx.strokeStyle = color; ctx.lineWidth = line; ctx.stroke();
  }
  return {
    resize(w, h, ratio) {
      width = w; height = h; canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    clear() { ctx.clearRect(0, 0, width, height); },
    draw(bubbles, { light }) {
      ctx.clearRect(0, 0, width, height);
      for (const b of bubbles) {
        const r = b.r;
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1 + b.wobble, 1 - b.wobble * .8); ctx.globalAlpha = b.alpha;
        const film = ctx.createRadialGradient(-r * .24, -r * .28, r * .04, 0, 0, r);
        film.addColorStop(0, light ? '#ffffff0a' : '#d8f8ff02');
        film.addColorStop(.68, light ? '#30b5df08' : '#53ceff04');
        film.addColorStop(.9, light ? '#0894c21b' : '#43caff15');
        film.addColorStop(1, light ? '#057ba13f' : '#8be5ff40');
        ctx.fillStyle = film; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        const rim = ctx.createLinearGradient(-r, -r, r, r);
        rim.addColorStop(0, light ? '#ffffff' : '#f4ffff');
        rim.addColorStop(.24, light ? '#ffffffed' : '#c3f6fff0');
        rim.addColorStop(.44, light ? '#259dc852' : '#60c7ed50');
        rim.addColorStop(.7, light ? '#197cbe65' : '#9eacff70');
        rim.addColorStop(.9, light ? '#1c9ccb' : '#4bcfffd9');
        rim.addColorStop(1, light ? '#c5f4ff' : '#d5fbff');
        ctx.lineCap = 'round'; ring(r, 0, Math.PI * 2, rim, r > 12 ? 1.1 : .85);
        if (r > 6) {
          ring(r * .87, Math.PI * 1.1, Math.PI * 1.46, light ? '#ffffffdd' : '#e5fbffdc', 1.3);
          ring(r * .86, Math.PI * .09, Math.PI * .32, light ? '#108ebda0' : '#56cbffc0', .8);
          const reflection = ctx.createRadialGradient(-r * .38, -r * .48, 0, -r * .38, -r * .48, r * .3);
          reflection.addColorStop(0, light ? '#ffffff77' : '#e4ffff42'); reflection.addColorStop(1, '#ffffff00');
          ctx.fillStyle = reflection; ctx.beginPath(); ctx.ellipse(-r * .38, -r * .48, r * .29, r * .2, -.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    },
    dispose() { ctx.clearRect(0, 0, width, height); canvas.width = canvas.height = 1; }
  };
}
