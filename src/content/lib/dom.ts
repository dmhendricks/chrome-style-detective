/*!
 * Style Detective — typed DOM construction helpers.
 *
 * Replaces the original string-concatenated `innerHTML` with typed element
 * builders, so nothing on the host page can be affected by unescaped markup and
 * the panel's structure is expressed as real nodes.
 */

import { copyTextToClipboard } from './clipboard';

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
    if (opts.text !== undefined) node.appendChild(doc.createTextNode(opts.text));
    if (opts.children) {
        for (const child of opts.children) node.appendChild(child);
    }

    return node;
}

/**
 * Build the small colour swatch shown next to a colour value. Replaces the
 * inline-`<span style=...>` HTML the original `RGBToHex` returned as a string.
 */
export function colorSwatch(doc: Document, hex: string): HTMLSpanElement {
    const swatch = doc.createElement('span');
    swatch.className = 'StyleDetectiveOverlay__color-swatch';
    swatch.style.setProperty('background-color', hex, 'important');

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

function isOverlayFrozen(doc: Document): boolean {
    return doc.getElementById(OVERLAY_ID)?.classList.contains(FROZEN_CLASS) ?? false;
}

function flashCopyAffordance(affordance: HTMLSpanElement, doc: Document): void {
    affordance.replaceChildren(checkIcon(doc));
    window.setTimeout(() => {
        affordance.replaceChildren(clipboardIcon(doc));
    }, 900);
}

/** Match #RGB, #RRGGBB, or #RRGGBBAA hex tokens in a property value string. */
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Expand #RGB and remap pure black so swatches stay visible on the panel. */
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
    }

    if (normalized === '#000000') {
        normalized = '#FFFFFF';
    }

    return normalized;
}

function firstHexIn(text: string): string | null {
    return text.match(HEX_COLOR_RE)?.[0] ?? null;
}

function copyableHexGroup(doc: Document, hex: string, copyValue: string): HTMLSpanElement {
    const group = doc.createElement('span');
    group.className = 'StyleDetectiveOverlay__color-hash-group';

    const hash = doc.createElement('span');
    hash.className = 'StyleDetectiveOverlay__color-hash';
    hash.textContent = hex;

    const affordance = doc.createElement('span');
    affordance.className = 'StyleDetectiveOverlay__copy-affordance';
    affordance.title = 'Copy';
    affordance.appendChild(clipboardIcon(doc));

    group.append(hash, affordance);

    const onCopy = (e: Event): void => {
        if (!isOverlayFrozen(doc)) return;
        e.preventDefault();
        e.stopPropagation();
        void copyTextToClipboard(copyValue).then(
            () => flashCopyAffordance(affordance, doc),
            () => {},
        );
    };

    group.addEventListener('click', onCopy);

    return group;
}

/** Wrap every hex token in a string with a frozen-mode copy affordance. */
export function textWithCopyableHex(doc: Document, text: string): DocumentFragment {
    const frag = doc.createDocumentFragment();
    const leadingHex = firstHexIn(text);

    if (leadingHex) {
        frag.appendChild(colorSwatch(doc, normalizeHexForSwatch(leadingHex)));
    }

    let lastIndex = 0;

    for (const match of text.matchAll(HEX_COLOR_RE)) {
        const hex = match[0];
        const index = match.index ?? 0;

        if (index > lastIndex) {
            frag.appendChild(doc.createTextNode(text.slice(lastIndex, index)));
        }

        frag.appendChild(copyableHexGroup(doc, hex, text));
        lastIndex = index + hex.length;
    }

    if (lastIndex === 0) {
        frag.appendChild(doc.createTextNode(text));
    } else if (lastIndex < text.length) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    return frag;
}

/**
 * Build a swatch + hex fragment for a colour value. When the panel is frozen,
 * hovering the hex reveals a copy icon; clicking the hex copies it.
 */
export function colorValue(doc: Document, hex: string): DocumentFragment {
    return textWithCopyableHex(doc, hex);
}

/**
 * Build the `<tag> #id .class` selector label shown in the panel header and used
 * for the CSS-definition selector line. Text nodes only — no markup injection.
 */
export function selectorLabel(el: HTMLElement): string {
    return (
        el.tagName +
        (el.id === '' ? '' : ' #' + el.id) +
        (el.className === '' ? '' : ' .' + el.className)
    );
}

/**
 * Replace an element's contents with `" : "` followed by a value that may be a
 * plain string or a Node (e.g. a colour swatch + hex text fragment).
 */
export function setValueContent(target: HTMLElement, value: string | Node): void {
    const doc = target.ownerDocument;
    target.textContent = ' : ';
    if (typeof value === 'string') {
        target.appendChild(textWithCopyableHex(doc, value));
    } else {
        target.appendChild(value);
    }
}
