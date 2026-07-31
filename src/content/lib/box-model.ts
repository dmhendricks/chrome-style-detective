/*!
 * Style Detective — box-model diagram data + DOM.
 *
 * Builds a DevTools-style concentric margin → border → padding → content
 * diagram for the Box category. Values come from the same computed-style
 * helpers used by the catalog rows.
 */

import { el } from './dom';
import { removeExtraFloat } from './format';
import type { InspectContext } from './properties';

const PREFIX = 'StyleDetectiveOverlay__box-model';

export type BoxSide = 'top' | 'right' | 'bottom' | 'left';

export const BOX_SIDES: readonly BoxSide[] = ['top', 'right', 'bottom', 'left'];

export interface BoxSides {
    top: string;
    right: string;
    bottom: string;
    left: string;
}

export interface BoxModelValues {
    margin: BoxSides;
    border: BoxSides;
    padding: BoxSides;
    /** Laid-out border-box size from getBoundingClientRect (rounded px). */
    width: number;
    height: number;
}

/** Normalize a computed length for diagram labels (`0px` → `0`). */
export function formatBoxLength(raw: string): string {
    const v = removeExtraFloat(raw.trim());
    return v === '0px' ? '0' : v;
}

export function readBoxSides(
    get: (property: string) => string,
    prefix: 'margin' | 'padding',
): BoxSides {
    return {
        top: formatBoxLength(get(`${prefix}-top`)),
        right: formatBoxLength(get(`${prefix}-right`)),
        bottom: formatBoxLength(get(`${prefix}-bottom`)),
        left: formatBoxLength(get(`${prefix}-left`)),
    };
}

/** Border ring shows widths only; `none` / missing style → `0`. */
export function readBorderWidths(get: (property: string) => string): BoxSides {
    const side = (name: BoxSide): string => {
        const style = get(`border-${name}-style`);
        if (!style || style === 'none') return '0';
        return formatBoxLength(get(`border-${name}-width`));
    };
    return {
        top: side('top'),
        right: side('right'),
        bottom: side('bottom'),
        left: side('left'),
    };
}

export function computeBoxModel(ctx: InspectContext): BoxModelValues {
    const rect = ctx.el.getBoundingClientRect();
    return {
        margin: readBoxSides(ctx.get, 'margin'),
        border: readBorderWidths(ctx.get),
        padding: readBoxSides(ctx.get, 'padding'),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
}

interface RingLabels {
    top: HTMLElement;
    right: HTMLElement;
    bottom: HTMLElement;
    left: HTMLElement;
}

interface BoxModelDom {
    root: HTMLElement;
    margin: RingLabels;
    border: RingLabels;
    padding: RingLabels;
    content: HTMLElement;
}

let cached: BoxModelDom | null = null;

function createLabels(doc: Document): RingLabels {
    return {
        top: el(doc, 'span', { className: `${PREFIX}-label ${PREFIX}-label--top` }),
        right: el(doc, 'span', { className: `${PREFIX}-label ${PREFIX}-label--right` }),
        bottom: el(doc, 'span', { className: `${PREFIX}-label ${PREFIX}-label--bottom` }),
        left: el(doc, 'span', { className: `${PREFIX}-label ${PREFIX}-label--left` }),
    };
}

function createRing(
    doc: Document,
    layer: 'margin' | 'border' | 'padding',
    labels: RingLabels,
    mid: HTMLElement,
): HTMLElement {
    // Column: top label → (left | mid | right) → bottom label.
    // Layer name is absolutely positioned in the corner (see style.scss).
    const midRow = el(doc, 'div', {
        className: `${PREFIX}-mid`,
        children: [labels.left, mid, labels.right],
    });
    return el(doc, 'div', {
        className: `${PREFIX}-ring ${PREFIX}-ring--${layer}`,
        children: [
            el(doc, 'span', {
                className: `${PREFIX}-layer`,
                text: layer,
            }),
            labels.top,
            midRow,
            labels.bottom,
        ],
    });
}

function setSideLabels(labels: RingLabels, sides: BoxSides): void {
    labels.top.textContent = sides.top;
    labels.right.textContent = sides.right;
    labels.bottom.textContent = sides.bottom;
    labels.left.textContent = sides.left;
}

/** Build the diagram once; call `updateBoxModelDiagram` on each hover. */
export function createBoxModelDiagram(doc: Document): HTMLElement {
    const margin = createLabels(doc);
    const border = createLabels(doc);
    const padding = createLabels(doc);
    const content = el(doc, 'div', {
        className: `${PREFIX}-content`,
        text: '0 × 0',
    });

    const paddingRing = createRing(doc, 'padding', padding, content);
    const borderRing = createRing(doc, 'border', border, paddingRing);
    const marginRing = createRing(doc, 'margin', margin, borderRing);

    const root = el(doc, 'div', {
        className: PREFIX,
        children: [marginRing],
    });

    cached = { root, margin, border, padding, content };
    return root;
}

export function clearBoxModelCache(): void {
    cached = null;
}

/** Refresh live labels from the hovered element's computed box. */
export function updateBoxModelDiagram(ctx: InspectContext): void {
    if (!cached) return;
    const values = computeBoxModel(ctx);
    setSideLabels(cached.margin, values.margin);
    setSideLabels(cached.border, values.border);
    setSideLabels(cached.padding, values.padding);
    cached.content.textContent = `${values.width} × ${values.height}`;
}
