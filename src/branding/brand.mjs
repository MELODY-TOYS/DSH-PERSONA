/** Project artwork used for package icon seats and the standalone preview favicon. */
import artwork from '../../assets/brand/visual.avif';

export const BRAND = Object.freeze({
  name: 'dsh-persona', artwork, width: 640, height: 960,
  iconPosition: '50% 100%',
});

export const ICON_SEATS = [
  '[data-plugin-package="dsh-persona"] > div:first-of-type > span:first-child[aria-hidden="true"]',
  '[data-plugin-detail="dsh-persona"] > div:first-of-type > span:first-child[aria-hidden="true"]',
].join(',\n');

/** Keep the host icon until the project image has decoded. */
export function installBrandIcons(doc = document) {
  let disposed = false;
  const style = doc.createElement('style');
  style.dataset.dshPersonaBrand = 'icons';
  const probe = doc.createElement('img');
  probe.onload = () => {
    if (disposed) return;
    style.textContent = `${ICON_SEATS} {
      background-image: url("${artwork}");
      background-size: cover; background-position: ${BRAND.iconPosition};
      background-repeat: no-repeat; overflow: hidden;
    }
    ${ICON_SEATS.split(',\n').map(s => `${s} > svg`).join(',\n')} { opacity: 0; }`;
    doc.head.append(style);
  };
  probe.src = artwork;
  return () => {
    disposed = true; probe.onload = null; probe.onerror = null;
    probe.removeAttribute('src'); style.remove();
  };
}

/** Standalone preview favicon only; native DSH keeps its own browser favicon. */
export function installPreviewFavicon(doc = document) {
  let disposed = false;
  const link = doc.createElement('link'); link.rel = 'icon'; link.dataset.dspPreviewFavicon = '';
  const image = doc.createElement('img');
  image.onload = () => {
    if (disposed) return;
    const canvas = doc.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, image.naturalHeight - side,
      side, side, 0, 0, 64, 64);
    link.type = 'image/png'; link.href = canvas.toDataURL('image/png'); doc.head.append(link);
  };
  image.src = artwork;
  return () => { disposed = true; image.onload = null; image.removeAttribute('src'); link.remove(); };
}
