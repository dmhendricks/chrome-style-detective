/*!
 * Inject overlay CSS from the content script.
 *
 * Manifest `content_scripts.css` is unreliable in `about:blank` iframes whose
 * parent rewrites them with `document.open()` / `document.write()` (W3Schools
 * Tryit, CodePen-style sandboxes). The JS still injects; the declared CSS often
 * does not. Shipping the stylesheet with the script and attaching a <style>
 * tag keeps the panel styled in those frames.
 */

import overlayCss from '../style.scss?inline';

export const STYLES_ID = 'StyleDetectiveStyles';

/** Idempotent: safe to call on boot and again when arming the overlay. */
export function ensureOverlayStyles(doc: Document = document): HTMLStyleElement {
    const existing = doc.getElementById(STYLES_ID);
    if (existing instanceof HTMLStyleElement) return existing;

    const style = doc.createElement('style');
    style.id = STYLES_ID;
    style.textContent = overlayCss;
    (doc.head ?? doc.documentElement).appendChild(style);
    return style;
}
