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
import { countChipRows, formatClassesForCopy, parseClassTokens } from './classes';
import { copyTextToClipboard } from './clipboard';
import { el, isOverlayFrozen, keepOverlayInViewport, selectorLabel, setValueContent } from './dom';
import { saveClassesExpanded } from '../../shared/prefs';

const ID_PREFIX = 'StyleDetectiveOverlay__';
const ROW_HIDDEN = 'StyleDetectiveOverlay__row--hidden';
const CATEGORY_HIDDEN = 'StyleDetectiveOverlay__category--hidden';
const HEADER_EXPANDABLE = 'StyleDetectiveOverlay__header--expandable';
const HEADER_EXPANDED = 'StyleDetectiveOverlay__header--expanded';
const CLASSES_HIDDEN = 'StyleDetectiveOverlay__classes--hidden';
const CLASSES_COLLAPSED = 'StyleDetectiveOverlay__classes--collapsed';

type CopyNotifier = (message: string, tone?: 'default' | 'success') => void;

/** Cached DOM nodes for a property row, filled once in createBlock(). */
interface PropertyRow {
    li: HTMLElement;
    value: HTMLElement;
}

const propertyRows = new Map<string, PropertyRow>();
const categoryElements = new Map<string, HTMLElement>();

let classesRoot: HTMLElement | null = null;
let classesToggle: HTMLButtonElement | null = null;
let classesCopyAll: HTMLButtonElement | null = null;
let classesChips: HTMLElement | null = null;
let shortcutsContainer: HTMLElement | null = null;
let utilityFirstExtrasEnabled = false;
/** Sticky open/closed for the Classes row (defaults open so chips are visible). */
let classesExpanded = true;
let classesShowAllChips = false;
let currentClassTokens: readonly string[] = [];
let copyNotifier: CopyNotifier | null = null;

function clearPanelCache(): void {
    propertyRows.clear();
    categoryElements.clear();
    classesRoot = null;
    classesToggle = null;
    classesCopyAll = null;
    classesChips = null;
    shortcutsContainer = null;
}

/** Wire overlay copy feedback (toast) for class chip actions. */
export function setClassesCopyNotifier(notifier: CopyNotifier | null): void {
    copyNotifier = notifier;
}

/** Show or hide utility-first class tools and refresh footer shortcuts. */
export function setUtilityFirstExtrasEnabled(enabled: boolean): void {
    utilityFirstExtrasEnabled = enabled;
    if (!enabled) hideClassesPanel();
    rebuildFooterShortcuts();
}

/**
 * Apply persisted expand/collapse (all tabs/elements). Does not write storage —
 * callers that change the preference should save separately.
 */
export function setClassesExpanded(expanded: boolean): void {
    if (classesExpanded === expanded) return;
    classesExpanded = expanded;
    if (!classesExpanded) classesShowAllChips = false;
    if (classesRoot) refreshClassesChrome(classesRoot.ownerDocument);
}

function notifyCopy(message: string, tone: 'default' | 'success' = 'success'): void {
    copyNotifier?.(message, tone);
}

async function copyClassText(text: string, message: string): Promise<void> {
    try {
        await copyTextToClipboard(text);
        notifyCopy(message, 'success');
    } catch {
        notifyCopy('Could not copy to clipboard', 'default');
    }
}

function setClassesPanelVisible(visible: boolean): void {
    classesRoot?.classList.toggle(CLASSES_HIDDEN, !visible);
}

function hideClassesPanel(): void {
    setClassesPanelVisible(false);
    currentClassTokens = [];
}

function renderClassChips(doc: Document): void {
    if (!classesChips) return;

    const tokens = currentClassTokens;
    classesChips.replaceChildren();
    if (tokens.length === 0) return;

    const appendTokenChip = (token: string): void => {
        const chip = el(doc, 'button', {
            className: 'StyleDetectiveOverlay__class-chip',
            text: token,
        });
        chip.type = 'button';
        chip.title = `Copy ${token}`;
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            void copyClassText(token, `Copied ${token}`);
        });
        classesChips!.append(chip);
    };

    const appendMoreChip = (hiddenCount: number): void => {
        const more = el(doc, 'button', {
            className: 'StyleDetectiveOverlay__class-chip StyleDetectiveOverlay__class-chip--more',
            text: `+${hiddenCount} more`,
        });
        more.type = 'button';
        more.title = 'Show all classes';
        more.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            classesShowAllChips = true;
            renderClassChips(doc);
        });
        classesChips!.append(more);
    };

    const paint = (visibleCount: number, withMore: boolean): void => {
        classesChips!.replaceChildren();
        for (let i = 0; i < visibleCount; i++) {
            const token = tokens[i];
            if (token !== undefined) appendTokenChip(token);
        }
        if (withMore) appendMoreChip(tokens.length - visibleCount);
    };

    if (classesShowAllChips) {
        paint(tokens.length, false);
        return;
    }

    // Prefer showing every chip when it fits on two wrap lines.
    paint(tokens.length, false);
    if (countChipRows(classesChips) <= 2) return;

    // Binary-search the largest prefix that still fits in two lines with "+N more".
    let lo = 1;
    let hi = tokens.length - 1;
    let best = 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        paint(mid, true);
        if (countChipRows(classesChips) <= 2) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    paint(best, true);
}

function refreshClassesChrome(doc: Document): void {
    if (!classesToggle || !classesCopyAll) return;

    const count = currentClassTokens.length;
    const chevron = classesExpanded ? '▴' : '▾';
    classesToggle.textContent = `Classes (${count}) ${chevron}`;
    classesToggle.setAttribute('aria-expanded', classesExpanded ? 'true' : 'false');
    classesCopyAll.disabled = count === 0;

    classesRoot?.classList.toggle(CLASSES_COLLAPSED, !classesExpanded);
    if (classesExpanded) {
        renderClassChips(doc);
        // Remeasure after layout — panel may have been display:none on first paint.
        requestAnimationFrame(() => {
            if (classesExpanded && !classesShowAllChips) renderClassChips(doc);
        });
    }
}

/** Update the class chip panel for the hovered element (utility-first extras only). */
export function updateClassesPanel(target: HTMLElement): void {
    if (!utilityFirstExtrasEnabled || !classesRoot) {
        hideClassesPanel();
        return;
    }

    const doc = classesRoot.ownerDocument;
    currentClassTokens = parseClassTokens(target);
    if (currentClassTokens.length === 0) {
        hideClassesPanel();
        return;
    }

    // Keep expand/collapse sticky across hovers; only reset "+N more" per element.
    classesShowAllChips = false;
    setClassesPanelVisible(true);
    refreshClassesChrome(doc);
}

function createClassesSection(doc: Document): HTMLElement {
    classesToggle = el(doc, 'button', {
        className: 'StyleDetectiveOverlay__classes-toggle',
        text: 'Classes',
    });
    classesToggle.type = 'button';
    classesToggle.setAttribute('aria-expanded', 'true');

    classesCopyAll = el(doc, 'button', {
        className: 'StyleDetectiveOverlay__classes-copy-all',
        text: 'Copy all',
    });
    classesCopyAll.type = 'button';
    classesCopyAll.title = 'Copy all classes on this element';

    classesChips = el(doc, 'div', { className: 'StyleDetectiveOverlay__class-chips' });

    const head = el(doc, 'div', {
        className: 'StyleDetectiveOverlay__classes-head',
        children: [classesToggle, classesCopyAll],
    });

    const body = el(doc, 'div', {
        className: 'StyleDetectiveOverlay__classes-body',
        children: [classesChips],
    });

    classesToggle.addEventListener('click', (e) => {
        e.preventDefault();
        classesExpanded = !classesExpanded;
        if (!classesExpanded) classesShowAllChips = false;
        refreshClassesChrome(doc);
        void saveClassesExpanded(classesExpanded);
    });

    classesCopyAll.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = formatClassesForCopy(currentClassTokens);
        if (text === '') return;
        void copyClassText(text, 'Classes copied to clipboard');
    });

    classesRoot = el(doc, 'div', {
        id: 'StyleDetectiveOverlay__classes',
        className: `StyleDetectiveOverlay__classes ${CLASSES_HIDDEN}`,
        children: [head, body],
    });

    return classesRoot;
}

function makeShortcut(doc: Document, key: string, label: string): HTMLElement {
    return el(doc, 'span', {
        className: 'StyleDetectiveOverlay__shortcut',
        children: [
            el(doc, 'kbd', { text: key }),
            el(doc, 'span', {
                className: 'StyleDetectiveOverlay__shortcut-label',
                text: label,
            }),
        ],
    });
}

function rebuildFooterShortcuts(): void {
    if (!shortcutsContainer) return;
    const doc = shortcutsContainer.ownerDocument;
    const items: Array<[string, string]> = [
        ['F', 'Freeze'],
        ['C', 'Copy'],
        ['+/−', 'Zoom'],
        ['S', 'Settings'],
        ['Esc', 'Close'],
    ];
    shortcutsContainer.replaceChildren(...items.map(([key, label]) => makeShortcut(doc, key, label)));
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

    // With utility-first extras, classes live in the Classes row — keep the
    // banner to tag + id so it stays short and readable.
    selector.textContent = selectorLabel(el, {
        includeClasses: !utilityFirstExtrasEnabled,
    });
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
    const classesSection = createClassesSection(doc);

    const footer = el(doc, 'div', {
        id: 'StyleDetectiveOverlay__footer',
        children: [
            el(doc, 'div', {
                className: 'StyleDetectiveOverlay__shortcuts',
            }),
        ],
    });
    shortcutsContainer = footer.querySelector('.StyleDetectiveOverlay__shortcuts');
    rebuildFooterShortcuts();

    return el(doc, 'div', {
        id: 'StyleDetectiveOverlay',
        children: [header, classesSection, center, footer],
    });
}
