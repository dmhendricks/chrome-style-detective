/*!
 * Style Detective — panel renderer.
 *
 * Builds the overlay panel from the typed category data and updates each
 * property row from a hovered element's computed style. All DOM ids are
 * namespaced under `StyleDetectiveOverlay__` so nothing collides with the host
 * page.
 */

import { CSS_CATEGORIES, LIST_TAG_NAMES, TABLE_TAG_NAMES } from './properties';
import { getFileName, isInArray, removeExtraFloat, rgbToHex } from './format';
import { colorSwatch, el, setValueContent } from './dom';

const ID_PREFIX = 'StyleDetectiveOverlay__';

function currentDocument(): Document {
    return window.document;
}

/** Build a swatch + hex-text fragment for a colour value. */
function colorValue(doc: Document, rgb: string): DocumentFragment {
    const hex = rgbToHex(rgb);
    const frag = doc.createDocumentFragment();

    frag.appendChild(colorSwatch(doc, hex));
    frag.appendChild(doc.createTextNode(' ' + hex));

    return frag;
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

function setCSSProperty(style: CSSStyleDeclaration, property: string): void {
    const target = valueSpan(property);
    if (target) setValueContent(target, style.getPropertyValue(property));
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
        li.style.display = 'block';

        return 1;
    }

    li.style.display = 'none';

    return 0;
}

function setCSSPropertyValue(property: string, value: string | Node): void {
    const li = rowElement(property);
    const target = li?.lastChild as HTMLElement | null;
    if (!li || !target) return;

    setValueContent(target, value);
    li.style.display = 'block';
}

function setCSSPropertyValueIf(property: string, value: string | Node, condition: boolean): number {
    const li = rowElement(property);
    if (!li) return 0;

    if (condition) {
        const target = li.lastChild as HTMLElement | null;
        if (target) setValueContent(target, value);
        li.style.display = 'block';

        return 1;
    }

    li.style.display = 'none';

    return 0;
}

function hideCSSProperty(property: string): void {
    const li = rowElement(property);
    if (li) li.style.display = 'none';
}

function hideCSSCategory(category: string): void {
    const div = currentDocument().getElementById(ID_PREFIX + category);
    if (div) div.style.display = 'none';
}

function showCSSCategory(category: string): void {
    const div = currentDocument().getElementById(ID_PREFIX + category);
    if (div) div.style.display = 'block';
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
    setCSSPropertyIf(style, 'word-spacing', getCSSProperty(style, 'word-spacing') != 'normal');
}

function updateColorBg(style: CSSStyleDeclaration): void {
    const doc = currentDocument();

    setCSSPropertyValue('color', colorValue(doc, getCSSProperty(style, 'color')));

    setCSSPropertyValueIf(
        'background-color',
        colorValue(doc, getCSSProperty(style, 'background-color')),
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
        'background-repeat',
        getCSSProperty(style, 'background-repeat') != 'repeat',
    );
}

function updateBox(style: CSSStyleDeclaration): void {
    setCSSPropertyIf(style, 'height', removeExtraFloat(getCSSProperty(style, 'height')) != 'auto');
    setCSSPropertyIf(style, 'width', removeExtraFloat(getCSSProperty(style, 'width')) != 'auto');

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
}

function updatePositioning(style: CSSStyleDeclaration): void {
    setCSSPropertyIf(style, 'position', getCSSProperty(style, 'position') != 'static');
    setCSSPropertyIf(style, 'top', getCSSProperty(style, 'top') != 'auto');
    setCSSPropertyIf(style, 'bottom', getCSSProperty(style, 'bottom') != 'auto');
    setCSSPropertyIf(style, 'right', getCSSProperty(style, 'right') != 'auto');
    setCSSPropertyIf(style, 'left', getCSSProperty(style, 'left') != 'auto');
    setCSSPropertyIf(style, 'float', getCSSProperty(style, 'float') != 'none');

    setCSSProperty(style, 'display');

    setCSSPropertyIf(style, 'clear', getCSSProperty(style, 'clear') != 'none');
    setCSSPropertyIf(style, 'z-index', getCSSProperty(style, 'z-index') != 'auto');
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

    nbProperties += setCSSPropertyIf(style, 'transform', getCSSProperty(style, 'transform') !== '');
    nbProperties += setCSSPropertyIf(style, 'transition', getCSSProperty(style, 'transition') !== '');
    nbProperties += setCSSPropertyIf(style, 'outline', getCSSProperty(style, 'outline') !== '');
    nbProperties += setCSSPropertyIf(
        style,
        'outline-offset',
        getCSSProperty(style, 'outline-offset') != '0px',
    );
    nbProperties += setCSSPropertyIf(
        style,
        'box-sizing',
        getCSSProperty(style, 'box-sizing') != 'content-box',
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
export function updatePanel(style: CSSStyleDeclaration, tagName: string): void {
    updateFontText(style);
    updateColorBg(style);
    updateBox(style);
    updatePositioning(style);
    updateTable(style, tagName);
    updateList(style, tagName);
    updateMisc(style);
    updateEffects(style);
}

/**
 * Build the panel element (header, per-category property lists, footer). Ids are
 * assigned so the update functions above can address each row and category.
 */
export function createBlock(doc: Document): HTMLDivElement {
    const header = el(doc, 'h1');

    const categoryDivs = CSS_CATEGORIES.map((category) => {
        const rows = category.properties.map((property) =>
            el(doc, 'li', {
                id: ID_PREFIX + property,
                children: [
                    el(doc, 'span', {
                        className: 'StyleDetectiveOverlay__property',
                        text: property,
                    }),
                    el(doc, 'span'),
                ],
            }),
        );

        return el(doc, 'div', {
            id: ID_PREFIX + category.key,
            className: 'StyleDetectiveOverlay__category',
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
