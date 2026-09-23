import loopVideo from '../../assets/brand/persona-loop.mp4';
import artwork from '../../assets/brand/visual.avif';
import { installOceanDetails } from './ocean-detail.mjs';

/** Apply the ocean presentation to this plugin's native DSH detail nodes. */
export function installDetailBackgroundObserver(doc = document) {
  return installOceanDetails(doc, { artwork, loopVideo });
}

/** A focused mount uses the same production observer and releases all owned effects. */
export function installDetailBackground(root) {
  const detail = root?.closest?.('[data-plugin-detail="dsh-persona"], [data-plugin-row-detail^="dsh-persona#"]');
  return detail ? installDetailBackgroundObserver(detail.ownerDocument) : () => {};
}
