/*!
 * Style Detective — CSS property category definitions.
 *
 * The panel groups properties into labelled categories. Each category has a
 * stable `key` (used for DOM ids like `StyleDetectiveOverlay__pFontText` and for
 * table/list gating), a display `title`, and the ordered list of properties it
 * renders. Keeping this as one typed array is the single source of truth for
 * both panel construction and the generated CSS definition.
 */

export interface CssCategory {
    /** Stable identifier; used in DOM ids and category show/hide logic. */
    key: string;
    /** Human-readable heading shown in the panel. */
    title: string;
    /** Properties rendered under this category, in display order. */
    properties: readonly string[];
}

export const CSS_CATEGORIES: readonly CssCategory[] = [
    {
        key: 'pFontText',
        title: 'Font & Text',
        properties: [
            'font-family',
            'font-size',
            'font-style',
            'font-variant',
            'font-weight',
            'letter-spacing',
            'line-height',
            'text-decoration',
            'text-align',
            'text-indent',
            'text-transform',
            'vertical-align',
            'white-space',
            'word-spacing',
        ],
    },
    {
        key: 'pColorBg',
        title: 'Color & Background',
        properties: [
            'background-attachment',
            'background-color',
            'background-image',
            'background-position',
            'background-repeat',
            'color',
        ],
    },
    {
        key: 'pBox',
        title: 'Box',
        properties: [
            'height',
            'width',
            'border',
            'border-top',
            'border-right',
            'border-bottom',
            'border-left',
            'margin',
            'padding',
            'max-height',
            'min-height',
            'max-width',
            'min-width',
        ],
    },
    {
        key: 'pPositioning',
        title: 'Positioning',
        properties: [
            'position',
            'top',
            'bottom',
            'right',
            'left',
            'float',
            'display',
            'clear',
            'z-index',
        ],
    },
    {
        key: 'pList',
        title: 'List',
        properties: ['list-style-image', 'list-style-type', 'list-style-position'],
    },
    {
        key: 'pTable',
        title: 'Table',
        properties: [
            'border-collapse',
            'border-spacing',
            'caption-side',
            'empty-cells',
            'table-layout',
        ],
    },
    {
        key: 'pMisc',
        title: 'Miscellaneous',
        properties: ['overflow', 'cursor', 'visibility'],
    },
    {
        key: 'pEffect',
        title: 'Effects',
        properties: [
            'transform',
            'transition',
            'outline',
            'outline-offset',
            'box-sizing',
            'resize',
            'text-shadow',
            'text-overflow',
            'word-wrap',
            'box-shadow',
            'border-top-left-radius',
            'border-top-right-radius',
            'border-bottom-left-radius',
            'border-bottom-right-radius',
        ],
    },
];

/** Look up a category's property list by key (used by the CSS-definition builder). */
export function propertiesFor(key: string): readonly string[] {
    return CSS_CATEGORIES.find((c) => c.key === key)?.properties ?? [];
}

export const TABLE_TAG_NAMES: readonly string[] = [
    'TABLE',
    'CAPTION',
    'THEAD',
    'TBODY',
    'TFOOT',
    'COLGROUP',
    'COL',
    'TR',
    'TH',
    'TD',
];

export const LIST_TAG_NAMES: readonly string[] = ['UL', 'LI', 'DD', 'DT', 'OL'];
