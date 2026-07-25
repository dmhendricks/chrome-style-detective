/*!
 * Style Detective — CSS property category definitions.
 *
 * Single source of truth for panel rows and the generated CSS definition.
 * Each property can declare how to format its value and when it is visible;
 * panel.ts runs one update loop over this catalog.
 *
 * Properties with `enabled: false` stay in the catalog for a future picker but
 * are omitted from the panel and CSS dump.
 */

import { formatAspectRatio, getFileName, removeExtraFloat, rgbToHex } from './format';

/** Per-hover context passed to format / value / when callbacks. */
export interface InspectContext {
    style: CSSStyleDeclaration;
    el: HTMLElement;
    get: (property: string) => string;
}

export interface CssProperty {
    /** CSS property name (as accepted by getPropertyValue), and panel row id. */
    name: string;
    /**
     * When false, the property is hidden from the panel / CSS dump but kept in
     * the catalog. Defaults to true when omitted.
     */
    enabled?: boolean;
    /**
     * Hide the row when the raw computed value equals this string (or is in
     * this list). Compared before `format` / `value`.
     */
    hideDefault?: string | readonly string[];
    /** Replace the raw computed value for display. */
    format?: (raw: string, ctx: InspectContext) => string;
    /** Compute the displayed value from scratch (ignores raw getPropertyValue). */
    value?: (ctx: InspectContext) => string;
    /** Extra visibility gate; combined with hideDefault when both are set. */
    when?: (ctx: InspectContext) => boolean;
}

export interface CssCategory {
    /** Stable identifier; used in DOM ids and category show/hide logic. */
    key: string;
    /** Human-readable heading shown in the panel. */
    title: string;
    /** Properties under this category, in display order. */
    properties: readonly CssProperty[];
    /** When set, the category is only shown for these tag names (uppercase). */
    tags?: readonly string[];
    /** Hide the category heading when no property rows are visible. */
    hideWhenEmpty?: boolean;
}

/** True unless the property was explicitly disabled in the catalog. */
export function isPropertyEnabled(property: CssProperty): boolean {
    return property.enabled !== false;
}

/** Enabled property names for a category (panel + CSS-definition consumers). */
export function enabledPropertyNames(category: CssCategory): readonly string[] {
    return category.properties.filter(isPropertyEnabled).map((property) => property.name);
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

function isFlex(ctx: InspectContext): boolean {
    const display = ctx.get('display');
    return display === 'flex' || display === 'inline-flex';
}

function isFlexOrGrid(ctx: InspectContext): boolean {
    const display = ctx.get('display');
    return (
        display === 'flex' ||
        display === 'inline-flex' ||
        display === 'grid' ||
        display === 'inline-grid'
    );
}

function isRadiusZero(value: string): boolean {
    return value === '' || value.split(/\s+/).every((part) => part === '0px' || part === '0');
}

function borderSide(ctx: InspectContext, side: string): string {
    return (
        removeExtraFloat(ctx.get(`border-${side}-width`)) +
        ' ' +
        ctx.get(`border-${side}-style`) +
        ' ' +
        rgbToHex(ctx.get(`border-${side}-color`))
    );
}

function bordersUniform(ctx: InspectContext): boolean {
    const top = borderSide(ctx, 'top');
    return (
        top === borderSide(ctx, 'bottom') &&
        top === borderSide(ctx, 'right') &&
        top === borderSide(ctx, 'left')
    );
}

function boxShorthand(ctx: InspectContext, sides: readonly string[]): string {
    return sides
        .map((side) => {
            const v = removeExtraFloat(ctx.get(side));
            return v === '0px' ? '0' : v;
        })
        .join(' ');
}

export const CSS_CATEGORIES: readonly CssCategory[] = [
    {
        key: 'pFontText',
        title: 'Font & Text',
        properties: [
            { name: 'font-family' },
            { name: 'font-size' },
            { name: 'font-style', hideDefault: 'normal' },
            { name: 'font-variant', enabled: false, hideDefault: 'normal' },
            { name: 'font-weight', hideDefault: '400' },
            { name: 'letter-spacing', hideDefault: 'normal' },
            { name: 'line-height', hideDefault: 'normal' },
            { name: 'text-decoration', hideDefault: 'none' },
            { name: 'text-align', hideDefault: 'start' },
            { name: 'text-indent', enabled: false, hideDefault: '0px' },
            { name: 'text-transform', hideDefault: 'none' },
            { name: 'vertical-align', hideDefault: 'baseline' },
            { name: 'white-space', hideDefault: 'normal' },
            { name: 'overflow-wrap', hideDefault: 'normal' },
            { name: 'word-spacing', enabled: false, hideDefault: 'normal' },
        ],
    },
    {
        key: 'pColorBg',
        title: 'Color & Background',
        properties: [
            { name: 'color', format: (raw) => rgbToHex(raw) },
            {
                name: 'background-color',
                hideDefault: 'transparent',
                format: (raw) => rgbToHex(raw),
            },
            {
                name: 'background-image',
                hideDefault: 'none',
                format: (raw) => getFileName(raw),
            },
            { name: 'background-position', hideDefault: '' },
            { name: 'background-size', hideDefault: 'auto' },
            { name: 'background-repeat', hideDefault: 'repeat' },
            { name: 'background-attachment', enabled: false, hideDefault: 'scroll' },
        ],
    },
    {
        key: 'pBox',
        title: 'Box',
        properties: [
            {
                name: 'width',
                when: (ctx) => removeExtraFloat(ctx.get('width')) !== 'auto',
            },
            {
                name: 'height',
                when: (ctx) => removeExtraFloat(ctx.get('height')) !== 'auto',
            },
            {
                name: 'aspect-ratio',
                // Rendered box ratio (from layout), not only the CSS property.
                value: (ctx) => {
                    const rect = ctx.el.getBoundingClientRect();
                    return formatAspectRatio(rect.width, rect.height);
                },
                when: (ctx) => {
                    const rect = ctx.el.getBoundingClientRect();
                    return formatAspectRatio(rect.width, rect.height) !== '';
                },
            },
            { name: 'min-width', hideDefault: '0px' },
            { name: 'min-height', hideDefault: '0px' },
            { name: 'max-width', hideDefault: 'none' },
            { name: 'max-height', hideDefault: 'none' },
            {
                name: 'margin',
                value: (ctx) =>
                    boxShorthand(ctx, [
                        'margin-top',
                        'margin-right',
                        'margin-bottom',
                        'margin-left',
                    ]),
                when: (ctx) =>
                    boxShorthand(ctx, [
                        'margin-top',
                        'margin-right',
                        'margin-bottom',
                        'margin-left',
                    ]) !== '0 0 0 0',
            },
            {
                name: 'padding',
                value: (ctx) =>
                    boxShorthand(ctx, [
                        'padding-top',
                        'padding-right',
                        'padding-bottom',
                        'padding-left',
                    ]),
                when: (ctx) =>
                    boxShorthand(ctx, [
                        'padding-top',
                        'padding-right',
                        'padding-bottom',
                        'padding-left',
                    ]) !== '0 0 0 0',
            },
            {
                name: 'border',
                value: (ctx) => borderSide(ctx, 'top'),
                when: (ctx) =>
                    bordersUniform(ctx) && ctx.get('border-top-style') !== 'none',
            },
            {
                name: 'border-top',
                value: (ctx) => borderSide(ctx, 'top'),
                when: (ctx) =>
                    !bordersUniform(ctx) && ctx.get('border-top-style') !== 'none',
            },
            {
                name: 'border-right',
                value: (ctx) => borderSide(ctx, 'right'),
                when: (ctx) =>
                    !bordersUniform(ctx) && ctx.get('border-right-style') !== 'none',
            },
            {
                name: 'border-bottom',
                value: (ctx) => borderSide(ctx, 'bottom'),
                when: (ctx) =>
                    !bordersUniform(ctx) && ctx.get('border-bottom-style') !== 'none',
            },
            {
                name: 'border-left',
                value: (ctx) => borderSide(ctx, 'left'),
                when: (ctx) =>
                    !bordersUniform(ctx) && ctx.get('border-left-style') !== 'none',
            },
            {
                name: 'border-radius',
                when: (ctx) => !isRadiusZero(ctx.get('border-radius')),
            },
            { name: 'box-sizing', hideDefault: 'content-box' },
            { name: 'object-fit', hideDefault: 'fill' },
        ],
    },
    {
        key: 'pLayout',
        title: 'Layout',
        properties: [
            { name: 'display' },
            {
                name: 'flex-direction',
                hideDefault: 'row',
                when: isFlex,
            },
            {
                name: 'flex-wrap',
                hideDefault: 'nowrap',
                when: isFlex,
            },
            {
                name: 'justify-content',
                hideDefault: 'normal',
                when: isFlexOrGrid,
            },
            {
                name: 'align-items',
                hideDefault: 'normal',
                when: isFlexOrGrid,
            },
            {
                name: 'gap',
                hideDefault: ['normal', '0px'],
                when: isFlexOrGrid,
            },
            { name: 'position', hideDefault: 'static' },
            { name: 'top', hideDefault: 'auto' },
            { name: 'right', hideDefault: 'auto' },
            { name: 'bottom', hideDefault: 'auto' },
            { name: 'left', hideDefault: 'auto' },
            { name: 'z-index', hideDefault: 'auto' },
            { name: 'float', enabled: false, hideDefault: 'none' },
            { name: 'clear', enabled: false, hideDefault: 'none' },
        ],
    },
    {
        key: 'pList',
        title: 'List',
        tags: LIST_TAG_NAMES,
        properties: [
            {
                name: 'list-style-type',
                when: (ctx) => ctx.get('list-style-image') === 'none',
            },
            {
                name: 'list-style-image',
                when: (ctx) => ctx.get('list-style-image') !== 'none',
            },
            { name: 'list-style-position' },
        ],
    },
    {
        key: 'pTable',
        title: 'Table',
        tags: TABLE_TAG_NAMES,
        hideWhenEmpty: true,
        properties: [
            { name: 'border-collapse', hideDefault: 'separate' },
            { name: 'border-spacing', hideDefault: '0px 0px' },
            { name: 'caption-side', hideDefault: 'top' },
            { name: 'empty-cells', hideDefault: 'show' },
            { name: 'table-layout', hideDefault: 'auto' },
        ],
    },
    {
        key: 'pMisc',
        title: 'Miscellaneous',
        hideWhenEmpty: true,
        properties: [
            { name: 'opacity', hideDefault: '1' },
            { name: 'overflow', hideDefault: 'visible' },
            { name: 'cursor', hideDefault: 'auto' },
            { name: 'visibility', hideDefault: 'visible' },
        ],
    },
    {
        key: 'pEffect',
        title: 'Effects',
        hideWhenEmpty: true,
        properties: [
            { name: 'transform', hideDefault: ['', 'none'] },
            {
                name: 'transition',
                when: (ctx) => {
                    const value = ctx.get('transition');
                    return value !== '' && !value.startsWith('all 0s');
                },
            },
            { name: 'filter', hideDefault: 'none' },
            { name: 'box-shadow', hideDefault: 'none' },
            { name: 'text-shadow', hideDefault: 'none' },
            { name: 'text-overflow', hideDefault: 'clip' },
            // Kept for a future picker; outline is noisy beside the inspector's
            // own dashed highlight box over the hovered element.
            { name: 'outline', enabled: false, hideDefault: '' },
            { name: 'outline-offset', enabled: false, hideDefault: '0px' },
            { name: 'resize', enabled: false, hideDefault: 'none' },
            { name: 'word-wrap', enabled: false, hideDefault: 'normal' },
            { name: 'border-top-left-radius', enabled: false, hideDefault: '0px' },
            { name: 'border-top-right-radius', enabled: false, hideDefault: '0px' },
            { name: 'border-bottom-left-radius', enabled: false, hideDefault: '0px' },
            { name: 'border-bottom-right-radius', enabled: false, hideDefault: '0px' },
        ],
    },
];

/** Look up a category's enabled property names by key. */
export function propertiesFor(key: string): readonly string[] {
    const category = CSS_CATEGORIES.find((entry) => entry.key === key);
    return category ? enabledPropertyNames(category) : [];
}

/** Resolve display value + visibility for one catalog property. */
export function resolveProperty(
    property: CssProperty,
    ctx: InspectContext,
): { value: string; visible: boolean } {
    const raw = property.value ? property.value(ctx) : ctx.get(property.name);

    let visible = true;
    if (property.when && !property.when(ctx)) visible = false;

    if (visible && property.hideDefault !== undefined) {
        // hideDefault compares the raw computed style, not a value() override
        // (except when value replaces get entirely — then compare that result).
        const compared = property.value ? raw : ctx.get(property.name);
        const defaults = property.hideDefault;
        if (typeof defaults === 'string') {
            if (compared === defaults) visible = false;
        } else if (defaults.includes(compared)) {
            visible = false;
        }
    }

    const value =
        property.value || !property.format ? raw : property.format(ctx.get(property.name), ctx);

    return { value, visible };
}
