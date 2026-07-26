/*!
 * Style Detective — typed DOM construction helpers.
 *
 * Replaces the original string-concatenated `innerHTML` with typed element
 * builders, so nothing on the host page can be affected by unescaped markup and
 * the panel's structure is expressed as real nodes.
 */

import { copyTextToClipboard } from './clipboard';
import { notifyCopy } from './copy-feedback';

const OVERLAY_ID = 'StyleDetectiveOverlay';
const FROZEN_CLASS = 'StyleDetectiveOverlay--frozen';

/** Tag names we construct, mapped to their element types for `el()`. */
type TagName = keyof HTMLElementTagNameMap;

interface ElOptions {
    id?: string;
    className?: string;
    text?: string;
    children?: Node[];
}

/** Create an element with optional id/class/text/children in one call. */
export function el<K extends TagName>(
    doc: Document,
    tag: K,
    opts: ElOptions = {},
): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);

    if (opts.id !== undefined) node.id = opts.id;
    if (opts.className !== undefined) node.className = opts.className;
    if (opts.text !== undefined) node.append(doc.createTextNode(opts.text));
    if (opts.children) {
        for (const child of opts.children) node.append(child);
    }

    return node;
}

/**
 * Build the small colour swatch shown next to a colour value. Replaces the
 * inline-`<span style=...>` HTML the original `RGBToHex` returned as a string.
 * Semi-transparent fills sit on a light checkerboard so they match page paint
 * better than compositing onto the dark panel chrome.
 */
export function colorSwatch(doc: Document, cssColor: string): HTMLSpanElement {
    const swatch = doc.createElement('span');
    swatch.className = 'StyleDetectiveOverlay__color-swatch';

    const fill = doc.createElement('span');
    fill.className = 'StyleDetectiveOverlay__color-swatch-fill';
    fill.style.setProperty('background-color', cssColor, 'important');
    swatch.append(fill);

    return swatch;
}

function clipboardIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '9');
    rect.setAttribute('y', '2');
    rect.setAttribute('width', '6');
    rect.setAttribute('height', '4');
    rect.setAttribute('rx', '1');
    rect.setAttribute('ry', '1');

    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
        'd',
        'M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3',
    );

    svg.append(rect, path);
    return svg;
}

function checkIcon(doc: Document): SVGSVGElement {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const polyline = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '20 6 9 17 4 12');

    svg.append(polyline);
    return svg;
}

export function isOverlayFrozen(doc: Document = document): boolean {
    return doc.getElementById(OVERLAY_ID)?.classList.contains(FROZEN_CLASS) ?? false;
}

/**
 * Shift an absolutely-positioned overlay so its box stays inside the viewport
 * (used after font-size changes and header expand).
 */
export function keepOverlayInViewport(block: HTMLElement): void {
    const MARGIN = 8;
    // Leave room for the browser's link-URL preview along the bottom edge.
    const BOTTOM_MARGIN = 40;
    const rect = block.getBoundingClientRect();

    let dx = 0;
    let dy = 0;

    if (rect.right > window.innerWidth - MARGIN) {
        dx = window.innerWidth - MARGIN - rect.right;
    }
    if (rect.left + dx < MARGIN) {
        dx = MARGIN - rect.left;
    }
    if (rect.bottom > window.innerHeight - BOTTOM_MARGIN) {
        dy = window.innerHeight - BOTTOM_MARGIN - rect.bottom;
    }
    if (rect.top + dy < MARGIN) {
        dy = MARGIN - rect.top;
    }

    if (dx !== 0) {
        block.style.left = `${block.offsetLeft + dx}px`;
    }
    if (dy !== 0) {
        block.style.top = `${block.offsetTop + dy}px`;
    }
}

/** Match #RGB, #RRGGBB, or #RRGGBBAA hex tokens in a property value string. */
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Hex or rgb()/rgba() anywhere in a value (e.g. `1px solid rgba(...)`). */
const COLOR_TOKEN_RE =
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/gi;

/** Expand shorthand #RGB / #RGBA to six- or eight-digit hex for swatch fill. */
function normalizeHexForSwatch(hex: string): string {
    let normalized = hex.toUpperCase();

    if (normalized.length === 4) {
        normalized =
            '#' +
            normalized[1]! +
            normalized[1]! +
            normalized[2]! +
            normalized[2]! +
            normalized[3]! +
            normalized[3]!;
    } else if (normalized.length === 5) {
        normalized =
            '#' +
            normalized[1]! +
            normalized[1]! +
            normalized[2]! +
            normalized[2]! +
            normalized[3]! +
            normalized[3]! +
            normalized[4]! +
            normalized[4]!;
    }

    return normalized;
}

function swatchCssColor(token: string): string {
    return token.startsWith('#') ? normalizeHexForSwatch(token) : token;
}

function firstColorToken(text: string): string | null {
    return text.match(COLOR_TOKEN_RE)?.[0] ?? null;
}

/** Build display nodes for a value, adding a leading swatch when a color is present. */
function textWithColorSwatches(doc: Document, text: string): DocumentFragment {
    const frag = doc.createDocumentFragment();
    const leading = firstColorToken(text);

    if (leading) {
        frag.append(colorSwatch(doc, swatchCssColor(leading)));
    }

    let lastIndex = 0;

    for (const match of text.matchAll(HEX_COLOR_RE)) {
        const hex = match[0];
        const index = match.index ?? 0;

        if (index > lastIndex) {
            frag.append(doc.createTextNode(text.slice(lastIndex, index)));
        }

        frag.append(doc.createTextNode(hex));
        lastIndex = index + hex.length;
    }

    if (lastIndex === 0) {
        frag.append(doc.createTextNode(text));
    } else if (lastIndex < text.length) {
        frag.append(doc.createTextNode(text.slice(lastIndex)));
    }

    return frag;
}

function copyAffordance(doc: Document): HTMLSpanElement {
    const affordance = doc.createElement('span');
    affordance.className = 'StyleDetectiveOverlay__copy-affordance';
    affordance.title = 'Copy';
    affordance.append(clipboardIcon(doc));
    affordance.setAttribute('aria-hidden', 'true');

    return affordance;
}

function attachFrozenCopy(
    doc: Document,
    target: HTMLElement,
    affordance: HTMLElement,
    copyValue: string,
): void {
    target.addEventListener('click', (e) => {
        if (!isOverlayFrozen(doc)) return;
        e.preventDefault();
        e.stopPropagation();
        void copyTextToClipboard(copyValue).then(
            () => {
                affordance.replaceChildren(checkIcon(doc));
                window.setTimeout(() => {
                    affordance.replaceChildren(clipboardIcon(doc));
                }, 900);
            },
            () => {
                notifyCopy('Could not copy to clipboard', 'default');
            },
        );
    });
}

function wrapCopyableValue(doc: Document, copyValue: string): HTMLSpanElement {
    const group = doc.createElement('span');
    group.className = 'StyleDetectiveOverlay__value-group';

    const text = doc.createElement('span');
    text.className = 'StyleDetectiveOverlay__value-text';
    text.append(textWithColorSwatches(doc, copyValue));

    const affordance = copyAffordance(doc);
    group.append(text, affordance);
    attachFrozenCopy(doc, group, affordance, copyValue);

    return group;
}

/**
 * Element class attribute as a plain string. HTMLElement.className is a string,
 * but SVGElement.className is an SVGAnimatedString — never concatenate that.
 */
export function elementClassName(el: Element): string {
    return el.getAttribute('class') ?? '';
}

/**
 * Build the `<tag> #id` selector label shown in the panel header.
 * Classes live in the Classes row — omit them here so the banner stays short.
 * Text nodes only — no markup injection.
 */
export function selectorLabel(el: HTMLElement): string {
    return el.tagName + (el.id === '' ? '' : ' #' + el.id);
}

/**
 * Replace a property-value cell with a copyable value group (colon is CSS).
 * When frozen, hovering the value reveals a copy icon; clicking copies the full
 * property value string. Skips the DOM rebuild when the value is unchanged.
 */
export function setValueContent(
    target: HTMLElement,
    copyValue: string,
    options: { badge?: { text: string; tone: string } | null } = {},
): void {
    const badge = options.badge ?? null;
    const fingerprint = badge ? `${copyValue}\0${badge.tone}:${badge.text}` : copyValue;
    if (target.dataset.sdValue === fingerprint) return;

    const doc = target.ownerDocument;
    target.dataset.sdValue = fingerprint;

    const group = wrapCopyableValue(doc, copyValue);
    if (badge) {
        const pill = doc.createElement('span');
        pill.className = `StyleDetectiveOverlay__contrast-badge StyleDetectiveOverlay__contrast-badge--${badge.tone}`;
        pill.textContent = badge.text;
        pill.title = `WCAG ${badge.text}`;
        group.querySelector('.StyleDetectiveOverlay__value-text')?.append(pill);
    }

    target.replaceChildren(group);
}
