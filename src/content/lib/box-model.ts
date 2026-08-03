/*!
 * Style Detective — box-model diagram data + DOM.
 *
 * Builds a DevTools-style concentric margin → border → padding → content
 * diagram for the Box category. Values come from the same computed-style
 * helpers used by the catalog rows.
 */

import { attachFrozenCopyTarget, el, setCopyTargetValue } from './dom';
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
    /** Laid-out border-box size (offsetWidth/Height; ignores CSS transforms). */
    width: number;
    height: number;
}

/** Normalize a computed length for diagram labels (`0px` → `0`). */
export function formatBoxLength(raw: string): string {
    const v = removeExtraFloat(raw.trim());
    return v === '0px' ? '0' : v;
}

/** Display label for content size (`541 × 54`). */
export function formatBoxContentSize(width: number, height: number): string {
    return `${width} × ${height}`;
}

/** Clipboard payload for content size (`541x54`). */
export function formatBoxContentCopy(width: number, height: number): string {
    return `${width}x${height}`;
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

/** Layout border-box size in CSS pixels (ignores transforms / animations). */
export function layoutBorderBoxSize(el: HTMLElement): { width: number; height: number } {
    return {
        width: Math.round(el.offsetWidth),
        height: Math.round(el.offsetHeight),
    };
}

export function computeBoxModel(ctx: InspectContext): BoxModelValues {
    const size = layoutBorderBoxSize(ctx.el);
    return {
        margin: readBoxSides(ctx.get, 'margin'),
        border: readBorderWidths(ctx.get),
        padding: readBoxSides(ctx.get, 'padding'),
        width: size.width,
        height: size.height,
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
    for (const side of BOX_SIDES) {
        const node = labels[side];
        const value = sides[side];
        node.textContent = value;
        setCopyTargetValue(node, value);
    }
}

function wireSideCopyTargets(labels: RingLabels): void {
    for (const side of BOX_SIDES) {
        attachFrozenCopyTarget(labels[side]);
    }
}

/** Build the diagram once; call `updateBoxModelDiagram` on each hover. */
export function createBoxModelDiagram(doc: Document): HTMLElement {
    const margin = createLabels(doc);
    const border = createLabels(doc);
    const padding = createLabels(doc);
    const content = el(doc, 'div', {
        className: `${PREFIX}-content`,
        text: formatBoxContentSize(0, 0),
    });
    setCopyTargetValue(content, formatBoxContentCopy(0, 0));

    wireSideCopyTargets(margin);
    wireSideCopyTargets(border);
    wireSideCopyTargets(padding);
    attachFrozenCopyTarget(content);

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
    cached.content.textContent = formatBoxContentSize(values.width, values.height);
    setCopyTargetValue(
        cached.content,
        formatBoxContentCopy(values.width, values.height),
    );
}
