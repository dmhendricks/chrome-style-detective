/*!
 * Style Detective — CSS property category definitions.
 *
 * The panel groups properties into labelled categories. Each category has a
 * stable `key` (used for DOM ids like `StyleDetectiveOverlay__pFontText` and for
 * table/list gating), a display `title`, and the ordered list of properties it
 * renders. Keeping this as one typed array is the single source of truth for
 * both panel construction and the generated CSS definition.
 *
 * Properties with `enabled: false` are kept in the catalog for a future
 * user-configurable property picker, but are omitted from the panel and from
 * the generated CSS definition.
 */

export interface CssProperty {
    /** CSS property name (as accepted by getPropertyValue). */
    name: string;
    /**
     * When false, the property is hidden from the panel / CSS dump but kept in
     * the catalog. Defaults to true when omitted.
     */
    enabled?: boolean;
}

export interface CssCategory {
    /** Stable identifier; used in DOM ids and category show/hide logic. */
    key: string;
    /** Human-readable heading shown in the panel. */
    title: string;
    /** Properties under this category, in display order. */
    properties: readonly CssProperty[];
}

/** True unless the property was explicitly disabled in the catalog. */
export function isPropertyEnabled(property: CssProperty): boolean {
    return property.enabled !== false;
}

/** Enabled property names for a category (panel + CSS-definition consumers). */
export function enabledPropertyNames(category: CssCategory): readonly string[] {
    return category.properties.filter(isPropertyEnabled).map((property) => property.name);
}

export const CSS_CATEGORIES: readonly CssCategory[] = [
    {
        key: 'pFontText',
        title: 'Font & Text',
        properties: [
            { name: 'font-family' },
            { name: 'font-size' },
            { name: 'font-style' },
            { name: 'font-variant', enabled: false },
            { name: 'font-weight' },
            { name: 'letter-spacing' },
            { name: 'line-height' },
            { name: 'text-decoration' },
            { name: 'text-align' },
            { name: 'text-indent', enabled: false },
            { name: 'text-transform' },
            { name: 'vertical-align' },
            { name: 'white-space' },
            { name: 'overflow-wrap' },
            { name: 'word-spacing', enabled: false },
        ],
    },
    {
        key: 'pColorBg',
        title: 'Color & Background',
        properties: [
            { name: 'color' },
            { name: 'background-color' },
            { name: 'background-image' },
            { name: 'background-position' },
            { name: 'background-size' },
            { name: 'background-repeat' },
            { name: 'background-attachment', enabled: false },
        ],
    },
    {
        key: 'pBox',
        title: 'Box',
        properties: [
            { name: 'width' },
            { name: 'height' },
            { name: 'aspect-ratio' },
            { name: 'min-width' },
            { name: 'min-height' },
            { name: 'max-width' },
            { name: 'max-height' },
            { name: 'margin' },
            { name: 'padding' },
            { name: 'border' },
            { name: 'border-top' },
            { name: 'border-right' },
            { name: 'border-bottom' },
            { name: 'border-left' },
            { name: 'border-radius' },
            { name: 'box-sizing' },
            { name: 'object-fit' },
        ],
    },
    {
        key: 'pLayout',
        title: 'Layout',
        properties: [
            { name: 'display' },
            { name: 'flex-direction' },
            { name: 'flex-wrap' },
            { name: 'justify-content' },
            { name: 'align-items' },
            { name: 'gap' },
            { name: 'position' },
            { name: 'top' },
            { name: 'right' },
            { name: 'bottom' },
            { name: 'left' },
            { name: 'z-index' },
            { name: 'float', enabled: false },
            { name: 'clear', enabled: false },
        ],
    },
    {
        key: 'pList',
        title: 'List',
        properties: [
            { name: 'list-style-type' },
            { name: 'list-style-image' },
            { name: 'list-style-position' },
        ],
    },
    {
        key: 'pTable',
        title: 'Table',
        properties: [
            { name: 'border-collapse' },
            { name: 'border-spacing' },
            { name: 'caption-side' },
            { name: 'empty-cells' },
            { name: 'table-layout' },
        ],
    },
    {
        key: 'pMisc',
        title: 'Miscellaneous',
        properties: [
            { name: 'opacity' },
            { name: 'overflow' },
            { name: 'cursor' },
            { name: 'visibility' },
        ],
    },
    {
        key: 'pEffect',
        title: 'Effects',
        properties: [
            { name: 'transform' },
            { name: 'transition' },
            { name: 'filter' },
            { name: 'box-shadow' },
            { name: 'text-shadow' },
            { name: 'text-overflow' },
            // Kept for a future picker; outline is noisy because the inspector
            // paints its own dashed outline on the hovered element.
            { name: 'outline', enabled: false },
            { name: 'outline-offset', enabled: false },
            { name: 'resize', enabled: false },
            { name: 'word-wrap', enabled: false },
            { name: 'border-top-left-radius', enabled: false },
            { name: 'border-top-right-radius', enabled: false },
            { name: 'border-bottom-left-radius', enabled: false },
            { name: 'border-bottom-right-radius', enabled: false },
        ],
    },
];

/** Look up a category's enabled property names by key. */
export function propertiesFor(key: string): readonly string[] {
    const category = CSS_CATEGORIES.find((entry) => entry.key === key);
    return category ? enabledPropertyNames(category) : [];
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
