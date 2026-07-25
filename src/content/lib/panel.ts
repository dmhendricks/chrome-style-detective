/*!
 * Style Detective — panel renderer.
 *
 * Builds the overlay panel from the typed category data and updates each
 * property row from a hovered element's computed style via one data-driven
 * loop over the catalog. All DOM ids are namespaced under
 * `StyleDetectiveOverlay__` so nothing collides with the host page. Only
 * catalog entries with `enabled !== false` are rendered.
 */

import {
    CSS_CATEGORIES,
    isPropertyEnabled,
    resolveProperty,
    type InspectContext,
} from './properties';
import { el, isOverlayFrozen, keepOverlayInViewport, selectorLabel, setValueContent } from './dom';

const ID_PREFIX = 'StyleDetectiveOverlay__';
const ROW_HIDDEN = 'StyleDetectiveOverlay__row--hidden';
const CATEGORY_HIDDEN = 'StyleDetectiveOverlay__category--hidden';
const HEADER_EXPANDABLE = 'StyleDetectiveOverlay__header--expandable';
const HEADER_EXPANDED = 'StyleDetectiveOverlay__header--expanded';

/** Cached DOM nodes for a property row, filled once in createBlock(). */
interface PropertyRow {
    li: HTMLElement;
    value: HTMLElement;
}

const propertyRows = new Map<string, PropertyRow>();
const categoryElements = new Map<string, HTMLElement>();

function clearPanelCache(): void {
    propertyRows.clear();
    categoryElements.clear();
}

function setRowVisible(li: HTMLElement, visible: boolean): void {
    li.classList.toggle(ROW_HIDDEN, !visible);
}

function setCategoryVisible(div: HTMLElement, visible: boolean): void {
    div.classList.toggle(CATEGORY_HIDDEN, !visible);
}

/** Update every category from a hovered element's computed style. */
export function updatePanel(style: CSSStyleDeclaration, el: HTMLElement): void {
    const ctx: InspectContext = {
        style,
        el,
        get: (property) => style.getPropertyValue(property),
    };

    for (const category of CSS_CATEGORIES) {
        const categoryEl = categoryElements.get(category.key);
        if (!categoryEl) continue;

        if (category.tags && !category.tags.includes(el.tagName)) {
            setCategoryVisible(categoryEl, false);
            continue;
        }

        let visibleCount = 0;

        for (const property of category.properties) {
            if (!isPropertyEnabled(property)) continue;

            const row = propertyRows.get(property.name);
            if (!row) continue;

            const resolved = resolveProperty(property, ctx);
            if (resolved.visible) {
                setValueContent(row.value, resolved.value, { badge: resolved.badge });
                setRowVisible(row.li, true);
                visibleCount += 1;
            } else {
                setRowVisible(row.li, false);
            }
        }

        if (category.hideWhenEmpty) {
            setCategoryVisible(categoryEl, visibleCount > 0);
        } else if (category.tags) {
            // Tag-gated categories without hideWhenEmpty (e.g. List) stay open
            // whenever the element matches.
            setCategoryVisible(categoryEl, true);
        } else {
            setCategoryVisible(categoryEl, true);
        }
    }
}

function panelHeader(): HTMLElement | null {
    return document.querySelector('#StyleDetectiveOverlay > h1');
}

function panelSelector(): HTMLElement | null {
    return document.querySelector('#StyleDetectiveOverlay .StyleDetectiveOverlay__selector');
}

/** Collapse the header and mark whether the clamped text overflows (clickable when frozen). */
export function refreshSelectorOverflow(): void {
    const header = panelHeader();
    const selector = panelSelector();
    if (!header || !selector) return;

    header.classList.remove(HEADER_EXPANDED);
    // Measure against the clamped box; +1 avoids float-rounding false positives.
    const overflowing = selector.scrollHeight > selector.clientHeight + 1;
    header.classList.toggle(HEADER_EXPANDABLE, overflowing);

    if (!overflowing) {
        header.title = '';
    } else if (isOverlayFrozen()) {
        header.title = 'Click to expand';
    } else {
        header.title = '';
    }
}

/** Collapse an expanded selector (e.g. on unfreeze / new hover). */
export function collapseSelectorHeader(): void {
    const header = panelHeader();
    if (!header) return;
    header.classList.remove(HEADER_EXPANDED);
    refreshSelectorOverflow();
}

function toggleSelectorExpanded(header: HTMLElement): void {
    if (!isOverlayFrozen()) return;
    if (
        !header.classList.contains(HEADER_EXPANDABLE) &&
        !header.classList.contains(HEADER_EXPANDED)
    ) {
        return;
    }

    const expanding = !header.classList.contains(HEADER_EXPANDED);
    header.classList.toggle(HEADER_EXPANDED, expanding);
    header.title = expanding ? 'Click to collapse' : 'Click to expand';

    const block = document.getElementById('StyleDetectiveOverlay');
    if (block) keepOverlayInViewport(block);
}

/** Update the header selector label for the hovered element. */
export function updateHeader(el: HTMLElement): void {
    const header = panelHeader();
    const selector = panelSelector();
    if (!selector) return;

    selector.textContent = selectorLabel(el);
    // New element → collapse; measure overflow after the clamped layout settles.
    header?.classList.remove(HEADER_EXPANDED);
    requestAnimationFrame(() => refreshSelectorOverflow());
}

/**
 * Build the panel element (header, per-category property lists, footer).
 * Property/category nodes are cached for O(1) updates (no getElementById per
 * row). Disabled catalog entries are omitted (available later for a picker).
 */
export function createBlock(doc: Document): HTMLDivElement {
    clearPanelCache();

    const selector = el(doc, 'span', { className: 'StyleDetectiveOverlay__selector' });
    const header = el(doc, 'h1', { children: [selector] });
    header.addEventListener('click', () => toggleSelectorExpanded(header));

    const categoryDivs = CSS_CATEGORIES.filter((category) =>
        category.properties.some(isPropertyEnabled),
    ).map((category) => {
        const rows = category.properties.filter(isPropertyEnabled).map((property) => {
            const value = el(doc, 'span', { className: 'StyleDetectiveOverlay__value' });
            const li = el(doc, 'li', {
                id: ID_PREFIX + property.name,
                // Hidden until the first updatePanel pass fills values — avoids
                // empty-row first paint glitches.
                className: ROW_HIDDEN,
                children: [
                    el(doc, 'span', {
                        className: 'StyleDetectiveOverlay__property',
                        text: property.label ?? property.name,
                    }),
                    value,
                ],
            });
            propertyRows.set(property.name, { li, value });

            return li;
        });

        // Tag-gated / empty-gated categories start hidden until updatePanel.
        const gated = Boolean(category.tags || category.hideWhenEmpty);

        const categoryDiv = el(doc, 'div', {
            id: ID_PREFIX + category.key,
            className: gated
                ? `StyleDetectiveOverlay__category ${CATEGORY_HIDDEN}`
                : 'StyleDetectiveOverlay__category',
            children: [el(doc, 'h2', { text: category.title }), el(doc, 'ul', { children: rows })],
        });
        categoryElements.set(category.key, categoryDiv);

        return categoryDiv;
    });

    const center = el(doc, 'div', { id: 'StyleDetectiveOverlay__center', children: categoryDivs });

    const shortcut = (key: string, label: string) =>
        el(doc, 'span', {
            className: 'StyleDetectiveOverlay__shortcut',
            children: [
                el(doc, 'kbd', { text: key }),
                el(doc, 'span', {
                    className: 'StyleDetectiveOverlay__shortcut-label',
                    text: label,
                }),
            ],
        });

    const footer = el(doc, 'div', {
        id: 'StyleDetectiveOverlay__footer',
        children: [
            el(doc, 'div', {
                className: 'StyleDetectiveOverlay__shortcuts',
                children: [
                    shortcut('F', 'Freeze'),
                    shortcut('C', 'Copy'),
                    shortcut('+/−', 'Zoom'),
                    shortcut('H', 'Help'),
                    shortcut('Esc', 'Close'),
                ],
            }),
        ],
    });

    return el(doc, 'div', {
        id: 'StyleDetectiveOverlay',
        children: [header, center, footer],
    });
}
