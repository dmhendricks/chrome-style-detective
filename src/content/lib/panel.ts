/*!
 * Style Detective — panel renderer.
 *
 * Builds the overlay panel from the typed category data and updates each
 * property row from a hovered element's computed style. All DOM ids are
 * namespaced under `StyleDetectiveOverlay__` so nothing collides with the host
 * page. Only catalog entries with `enabled !== false` are rendered.
 */

import {
    CSS_CATEGORIES,
    LIST_TAG_NAMES,
    TABLE_TAG_NAMES,
    enabledPropertyNames,
    isPropertyEnabled,
} from './properties';
import {
    formatAspectRatio,
    getFileName,
    isInArray,
    removeExtraFloat,
    rgbToHex,
} from './format';
import { el, isOverlayFrozen, selectorLabel, setValueContent } from './dom';

const ID_PREFIX = 'StyleDetectiveOverlay__';
const ROW_HIDDEN = 'StyleDetectiveOverlay__row--hidden';
const CATEGORY_HIDDEN = 'StyleDetectiveOverlay__category--hidden';
const HEADER_EXPANDABLE = 'StyleDetectiveOverlay__header--expandable';
const HEADER_EXPANDED = 'StyleDetectiveOverlay__header--expanded';

function currentDocument(): Document {
    return window.document;
}

function getCSSProperty(style: CSSStyleDeclaration, property: string): string {
    return style.getPropertyValue(property);
}

// The row for a property is an <li> whose last child holds the value span.
function valueSpan(property: string): HTMLElement | null {
    const li = currentDocument().getElementById(ID_PREFIX + property);

    return (li?.lastChild as HTMLElement | null) ?? null;
}

function rowElement(property: string): HTMLElement | null {
    return currentDocument().getElementById(ID_PREFIX + property);
}

function setRowVisible(li: HTMLElement, visible: boolean): void {
    li.classList.toggle(ROW_HIDDEN, !visible);
}

function setCategoryVisible(div: HTMLElement, visible: boolean): void {
    div.classList.toggle(CATEGORY_HIDDEN, !visible);
}

function setCSSProperty(style: CSSStyleDeclaration, property: string): void {
    const li = rowElement(property);
    const target = valueSpan(property);
    if (!li || !target) return;

    setValueContent(target, style.getPropertyValue(property));
    setRowVisible(li, true);
}

function setCSSPropertyIf(
    style: CSSStyleDeclaration,
    property: string,
    condition: boolean,
): number {
    const li = rowElement(property);
    if (!li) return 0;

    if (condition) {
        const target = li.lastChild as HTMLElement | null;
        if (target) setValueContent(target, style.getPropertyValue(property));
        setRowVisible(li, true);

        return 1;
    }

    setRowVisible(li, false);

    return 0;
}

function setCSSPropertyValue(property: string, value: string): void {
    const li = rowElement(property);
    const target = li?.lastChild as HTMLElement | null;
    if (!li || !target) return;

    setValueContent(target, value);
    setRowVisible(li, true);
}

function setCSSPropertyValueIf(property: string, value: string, condition: boolean): number {
    const li = rowElement(property);
    if (!li) return 0;

    if (condition) {
        const target = li.lastChild as HTMLElement | null;
        if (target) setValueContent(target, value);
        setRowVisible(li, true);

        return 1;
    }

    setRowVisible(li, false);

    return 0;
}

function hideCSSProperty(property: string): void {
    const li = rowElement(property);
    if (li) setRowVisible(li, false);
}

function hideCSSCategory(category: string): void {
    const div = currentDocument().getElementById(ID_PREFIX + category);
    if (div) setCategoryVisible(div, false);
}

function showCSSCategory(category: string): void {
    const div = currentDocument().getElementById(ID_PREFIX + category);
    if (div) setCategoryVisible(div, true);
}

function isRadiusZero(value: string): boolean {
    return value === '' || value.split(/\s+/).every((part) => part === '0px' || part === '0');
}

function updateFontText(style: CSSStyleDeclaration): void {
    setCSSProperty(style, 'font-family');
    setCSSProperty(style, 'font-size');

    setCSSPropertyIf(style, 'font-weight', getCSSProperty(style, 'font-weight') != '400');
    setCSSPropertyIf(style, 'font-variant', getCSSProperty(style, 'font-variant') != 'normal');
    setCSSPropertyIf(style, 'font-style', getCSSProperty(style, 'font-style') != 'normal');

    setCSSPropertyIf(style, 'letter-spacing', getCSSProperty(style, 'letter-spacing') != 'normal');
    setCSSPropertyIf(style, 'line-height', getCSSProperty(style, 'line-height') != 'normal');
    setCSSPropertyIf(
        style,
        'text-decoration',
        getCSSProperty(style, 'text-decoration') != 'none',
    );
    setCSSPropertyIf(style, 'text-align', getCSSProperty(style, 'text-align') != 'start');
    setCSSPropertyIf(style, 'text-indent', getCSSProperty(style, 'text-indent') != '0px');
    setCSSPropertyIf(style, 'text-transform', getCSSProperty(style, 'text-transform') != 'none');
    setCSSPropertyIf(
        style,
        'vertical-align',
        getCSSProperty(style, 'vertical-align') != 'baseline',
    );
    setCSSPropertyIf(style, 'white-space', getCSSProperty(style, 'white-space') != 'normal');
    setCSSPropertyIf(style, 'overflow-wrap', getCSSProperty(style, 'overflow-wrap') != 'normal');
    setCSSPropertyIf(style, 'word-spacing', getCSSProperty(style, 'word-spacing') != 'normal');
}

function updateColorBg(style: CSSStyleDeclaration): void {
    setCSSPropertyValue('color', rgbToHex(getCSSProperty(style, 'color')));

    setCSSPropertyValueIf(
        'background-color',
        rgbToHex(getCSSProperty(style, 'background-color')),
        getCSSProperty(style, 'background-color') != 'transparent',
    );
    setCSSPropertyIf(
        style,
        'background-attachment',
        getCSSProperty(style, 'background-attachment') != 'scroll',
    );
    setCSSPropertyValueIf(
        'background-image',
        getFileName(getCSSProperty(style, 'background-image')),
        getCSSProperty(style, 'background-image') != 'none',
    );
    setCSSPropertyIf(
        style,
        'background-position',
        getCSSProperty(style, 'background-position') != '',
    );
    setCSSPropertyIf(
        style,
        'background-size',
        getCSSProperty(style, 'background-size') != 'auto',
    );
    setCSSPropertyIf(
        style,
        'background-repeat',
        getCSSProperty(style, 'background-repeat') != 'repeat',
    );
}

function updateBox(style: CSSStyleDeclaration, el: HTMLElement): void {
    setCSSPropertyIf(style, 'height', removeExtraFloat(getCSSProperty(style, 'height')) != 'auto');
    setCSSPropertyIf(style, 'width', removeExtraFloat(getCSSProperty(style, 'width')) != 'auto');

    // Rendered box ratio (from layout), not only the CSS aspect-ratio property.
    const rect = el.getBoundingClientRect();
    const renderedRatio = formatAspectRatio(rect.width, rect.height);
    setCSSPropertyValueIf('aspect-ratio', renderedRatio, renderedRatio !== '');

    const border = (side: string): string =>
        removeExtraFloat(getCSSProperty(style, `border-${side}-width`)) +
        ' ' +
        getCSSProperty(style, `border-${side}-style`) +
        ' ' +
        rgbToHex(getCSSProperty(style, `border-${side}-color`));

    const borderTop = border('top');
    const borderBottom = border('bottom');
    const borderRight = border('right');
    const borderLeft = border('left');

    if (
        borderTop == borderBottom &&
        borderBottom == borderRight &&
        borderRight == borderLeft &&
        getCSSProperty(style, 'border-top-style') != 'none'
    ) {
        setCSSPropertyValue('border', borderTop);

        hideCSSProperty('border-top');
        hideCSSProperty('border-bottom');
        hideCSSProperty('border-right');
        hideCSSProperty('border-left');
    } else {
        setCSSPropertyValueIf(
            'border-top',
            borderTop,
            getCSSProperty(style, 'border-top-style') != 'none',
        );
        setCSSPropertyValueIf(
            'border-bottom',
            borderBottom,
            getCSSProperty(style, 'border-bottom-style') != 'none',
        );
        setCSSPropertyValueIf(
            'border-right',
            borderRight,
            getCSSProperty(style, 'border-right-style') != 'none',
        );
        setCSSPropertyValueIf(
            'border-left',
            borderLeft,
            getCSSProperty(style, 'border-left-style') != 'none',
        );

        hideCSSProperty('border');
    }

    const shorthand = (sides: readonly string[]): string =>
        sides
            .map((side) => {
                const v = removeExtraFloat(getCSSProperty(style, side));

                return v == '0px' ? '0' : v;
            })
            .join(' ');

    const margin = shorthand(['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
    setCSSPropertyValueIf('margin', margin, margin != '0 0 0 0');

    const padding = shorthand(['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
    setCSSPropertyValueIf('padding', padding, padding != '0 0 0 0');

    setCSSPropertyIf(style, 'min-height', getCSSProperty(style, 'min-height') != '0px');
    setCSSPropertyIf(style, 'max-height', getCSSProperty(style, 'max-height') != 'none');
    setCSSPropertyIf(style, 'min-width', getCSSProperty(style, 'min-width') != '0px');
    setCSSPropertyIf(style, 'max-width', getCSSProperty(style, 'max-width') != 'none');

    const borderRadius = getCSSProperty(style, 'border-radius');
    setCSSPropertyIf(style, 'border-radius', !isRadiusZero(borderRadius));

    setCSSPropertyIf(style, 'box-sizing', getCSSProperty(style, 'box-sizing') != 'content-box');
    setCSSPropertyIf(style, 'object-fit', getCSSProperty(style, 'object-fit') != 'fill');
}

function updateLayout(style: CSSStyleDeclaration): void {
    setCSSProperty(style, 'display');

    const display = getCSSProperty(style, 'display');
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    const isFlexOrGrid = isFlex || isGrid;

    setCSSPropertyIf(style, 'flex-direction', isFlex && getCSSProperty(style, 'flex-direction') != 'row');
    setCSSPropertyIf(style, 'flex-wrap', isFlex && getCSSProperty(style, 'flex-wrap') != 'nowrap');
    setCSSPropertyIf(
        style,
        'justify-content',
        isFlexOrGrid && getCSSProperty(style, 'justify-content') != 'normal',
    );
    setCSSPropertyIf(
        style,
        'align-items',
        isFlexOrGrid && getCSSProperty(style, 'align-items') != 'normal',
    );
    setCSSPropertyIf(
        style,
        'gap',
        isFlexOrGrid &&
            getCSSProperty(style, 'gap') != 'normal' &&
            getCSSProperty(style, 'gap') != '0px',
    );

    setCSSPropertyIf(style, 'position', getCSSProperty(style, 'position') != 'static');
    setCSSPropertyIf(style, 'top', getCSSProperty(style, 'top') != 'auto');
    setCSSPropertyIf(style, 'bottom', getCSSProperty(style, 'bottom') != 'auto');
    setCSSPropertyIf(style, 'right', getCSSProperty(style, 'right') != 'auto');
    setCSSPropertyIf(style, 'left', getCSSProperty(style, 'left') != 'auto');
    setCSSPropertyIf(style, 'z-index', getCSSProperty(style, 'z-index') != 'auto');
    setCSSPropertyIf(style, 'float', getCSSProperty(style, 'float') != 'none');
    setCSSPropertyIf(style, 'clear', getCSSProperty(style, 'clear') != 'none');
}

function updateTable(style: CSSStyleDeclaration, tagName: string): void {
    if (isInArray(TABLE_TAG_NAMES, tagName)) {
        let nbProperties = 0;

        nbProperties += setCSSPropertyIf(
            style,
            'border-collapse',
            getCSSProperty(style, 'border-collapse') != 'separate',
        );
        nbProperties += setCSSPropertyIf(
            style,
            'border-spacing',
            getCSSProperty(style, 'border-spacing') != '0px 0px',
        );
        nbProperties += setCSSPropertyIf(
            style,
            'caption-side',
            getCSSProperty(style, 'caption-side') != 'top',
        );
        nbProperties += setCSSPropertyIf(
            style,
            'empty-cells',
            getCSSProperty(style, 'empty-cells') != 'show',
        );
        nbProperties += setCSSPropertyIf(
            style,
            'table-layout',
            getCSSProperty(style, 'table-layout') != 'auto',
        );

        if (nbProperties > 0) showCSSCategory('pTable');
        else hideCSSCategory('pTable');
    } else {
        hideCSSCategory('pTable');
    }
}

function updateList(style: CSSStyleDeclaration, tagName: string): void {
    if (isInArray(LIST_TAG_NAMES, tagName)) {
        showCSSCategory('pList');

        const listStyleImage = getCSSProperty(style, 'list-style-image');

        if (listStyleImage == 'none') {
            setCSSProperty(style, 'list-style-type');
            hideCSSProperty('list-style-image');
        } else {
            setCSSPropertyValue('list-style-image', listStyleImage);
            hideCSSProperty('list-style-type');
        }

        setCSSProperty(style, 'list-style-position');
    } else {
        hideCSSCategory('pList');
    }
}

function updateMisc(style: CSSStyleDeclaration): void {
    let nbProperties = 0;

    nbProperties += setCSSPropertyIf(style, 'opacity', getCSSProperty(style, 'opacity') != '1');
    nbProperties += setCSSPropertyIf(style, 'overflow', getCSSProperty(style, 'overflow') != 'visible');
    nbProperties += setCSSPropertyIf(style, 'cursor', getCSSProperty(style, 'cursor') != 'auto');
    nbProperties += setCSSPropertyIf(
        style,
        'visibility',
        getCSSProperty(style, 'visibility') != 'visible',
    );

    if (nbProperties > 0) showCSSCategory('pMisc');
    else hideCSSCategory('pMisc');
}

function updateEffects(style: CSSStyleDeclaration): void {
    let nbProperties = 0;

    nbProperties += setCSSPropertyIf(
        style,
        'transform',
        getCSSProperty(style, 'transform') !== '' && getCSSProperty(style, 'transform') !== 'none',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'transition',
        getCSSProperty(style, 'transition') !== '' &&
            !getCSSProperty(style, 'transition').startsWith('all 0s'),
    );
    nbProperties += setCSSPropertyIf(style, 'filter', getCSSProperty(style, 'filter') != 'none');
    nbProperties += setCSSPropertyIf(style, 'outline', getCSSProperty(style, 'outline') !== '');
    nbProperties += setCSSPropertyIf(
        style,
        'outline-offset',
        getCSSProperty(style, 'outline-offset') != '0px',
    );
    nbProperties += setCSSPropertyIf(style, 'resize', getCSSProperty(style, 'resize') != 'none');

    nbProperties += setCSSPropertyIf(
        style,
        'text-shadow',
        getCSSProperty(style, 'text-shadow') != 'none',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'text-overflow',
        getCSSProperty(style, 'text-overflow') != 'clip',
    );
    nbProperties += setCSSPropertyIf(style, 'word-wrap', getCSSProperty(style, 'word-wrap') != 'normal');
    nbProperties += setCSSPropertyIf(style, 'box-shadow', getCSSProperty(style, 'box-shadow') != 'none');

    nbProperties += setCSSPropertyIf(
        style,
        'border-top-left-radius',
        getCSSProperty(style, 'border-top-left-radius') != '0px',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'border-top-right-radius',
        getCSSProperty(style, 'border-top-right-radius') != '0px',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'border-bottom-left-radius',
        getCSSProperty(style, 'border-bottom-left-radius') != '0px',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'border-bottom-right-radius',
        getCSSProperty(style, 'border-bottom-right-radius') != '0px',
    );

    if (nbProperties > 0) showCSSCategory('pEffect');
    else hideCSSCategory('pEffect');
}

/** Update every category from a hovered element's computed style. */
export function updatePanel(style: CSSStyleDeclaration, el: HTMLElement): void {
    updateFontText(style);
    updateColorBg(style);
    updateBox(style, el);
    updateLayout(style);
    updateTable(style, el.tagName);
    updateList(style, el.tagName);
    updateMisc(style);
    updateEffects(style);
}

function panelHeader(): HTMLElement | null {
    return currentDocument().querySelector('#StyleDetectiveOverlay > h1');
}

function panelSelector(): HTMLElement | null {
    return currentDocument().querySelector('#StyleDetectiveOverlay .StyleDetectiveOverlay__selector');
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

function keepOverlayInViewport(): void {
    const block = currentDocument().getElementById('StyleDetectiveOverlay');
    if (!block) return;

    const MARGIN = 8;
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

    if (dx !== 0) block.style.left = `${block.offsetLeft + dx}px`;
    if (dy !== 0) block.style.top = `${block.offsetTop + dy}px`;
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
    keepOverlayInViewport();
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
 * Build the panel element (header, per-category property lists, footer). Ids are
 * assigned so the update functions above can address each row and category.
 * Disabled catalog entries are omitted (available later for a property picker).
 */
export function createBlock(doc: Document): HTMLDivElement {
    const selector = el(doc, 'span', { className: 'StyleDetectiveOverlay__selector' });
    const header = el(doc, 'h1', { children: [selector] });
    header.addEventListener('click', () => toggleSelectorExpanded(header));

    const categoryDivs = CSS_CATEGORIES.filter(
        (category) => enabledPropertyNames(category).length > 0,
    ).map((category) => {
        const rows = category.properties.filter(isPropertyEnabled).map((property) =>
            el(doc, 'li', {
                id: ID_PREFIX + property.name,
                // Hidden until the first updatePanel pass fills values — avoids
                // empty-row first paint glitches.
                className: ROW_HIDDEN,
                children: [
                    el(doc, 'span', {
                        className: 'StyleDetectiveOverlay__property',
                        text: property.name,
                    }),
                    el(doc, 'span'),
                ],
            }),
        );

        // List/Table/Misc/Effects start hidden; updatePanel reveals them when
        // the hovered element has something to show.
        const gated = category.key === 'pList' || category.key === 'pTable' ||
            category.key === 'pMisc' || category.key === 'pEffect';

        return el(doc, 'div', {
            id: ID_PREFIX + category.key,
            className: gated
                ? `StyleDetectiveOverlay__category ${CATEGORY_HIDDEN}`
                : 'StyleDetectiveOverlay__category',
            children: [el(doc, 'h2', { text: category.title }), el(doc, 'ul', { children: rows })],
        });
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
