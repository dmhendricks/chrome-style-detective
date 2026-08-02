import { describe, expect, it } from 'vitest';
import {
    CSS_CATEGORIES,
    borderColorsUniform,
    borderSideColor,
    hasVisibleBorder,
    isPropertyEnabled,
    resolveProperty,
    type CssProperty,
    type InspectContext,
} from './properties';

/** Minimal context: only `get` is exercised by the rules under test. */
function ctxOf(values: Record<string, string>): InspectContext {
    return {
        style: {} as CSSStyleDeclaration,
        el: {} as HTMLElement,
        get: (name: string) => values[name] ?? '',
    };
}

/** Fill all four border longhands for width/style/color tests. */
function borderCtx(opts: {
    style?: string | { top?: string; right?: string; bottom?: string; left?: string };
    color?: string | { top?: string; right?: string; bottom?: string; left?: string };
    width?: string;
}): InspectContext {
    const sideValue = (
        map: string | { top?: string; right?: string; bottom?: string; left?: string } | undefined,
        side: 'top' | 'right' | 'bottom' | 'left',
        fallback: string,
    ): string => {
        if (map == null) return fallback;
        if (typeof map === 'string') return map;
        return map[side] ?? fallback;
    };

    const values: Record<string, string> = {};
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        values[`border-${side}-style`] = sideValue(opts.style, side, 'none');
        values[`border-${side}-color`] = sideValue(opts.color, side, 'rgba(0, 0, 0, 0)');
        values[`border-${side}-width`] = opts.width ?? '0px';
    }
    return ctxOf(values);
}

function findProperty(name: string): CssProperty {
    for (const category of CSS_CATEGORIES) {
        for (const property of category.properties) {
            if (property.name === name) return property;
        }
    }
    throw new Error(`property not in catalog: ${name}`);
}

/**
 * Mirrors the value selection in `collectCopyProperties` (core.ts): synthesized
 * `value()` and `copySafe` formatters win; other `format` helpers are skipped
 * in favour of the raw computed value. Shared by the CSS and JSON copy formats.
 */
function copiedValue(name: string, raw: string): string {
    const property = findProperty(name);
    const ctx = ctxOf({ [name]: raw });
    const resolved = resolveProperty(property, ctx);
    return property.value || property.copySafe ? resolved.value : ctx.get(name);
}

describe('copySafe — panel and clipboard agree on colors', () => {
    it('copies opaque colors as hex, matching the panel', () => {
        expect(copiedValue('color', 'rgb(68, 147, 248)')).toBe('#4493F8');
        expect(copiedValue('background-color', 'rgb(0, 0, 0)')).toBe('#000000');
    });

    it('copies alpha colors as rgba(), not 8-digit hex', () => {
        expect(copiedValue('color', 'rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('copies fully transparent colors as the transparent keyword', () => {
        expect(copiedValue('background-color', 'rgba(0, 0, 0, 0)')).toBe('transparent');
    });

    it('leaves display-only formatters out of copy so values round-trip', () => {
        // formatBackgroundImage strips url() for the panel; copying that would
        // emit invalid CSS, so background-image must stay raw.
        expect(copiedValue('background-image', 'url("https://e.com/a.png")')).toBe(
            'url("https://e.com/a.png")',
        );
    });

    it('marks only formatters whose output is valid CSS as copySafe', () => {
        expect(findProperty('color').copySafe).toBe(true);
        expect(findProperty('background-color').copySafe).toBe(true);
        expect(findProperty('background-image').copySafe).toBeUndefined();
    });
});

describe('resolveProperty visibility rules', () => {
    it('hides a property whose raw value equals hideDefault', () => {
        const property = findProperty('background-image');
        expect(resolveProperty(property, ctxOf({ 'background-image': 'none' })).visible).toBe(
            false,
        );
        expect(
            resolveProperty(property, ctxOf({ 'background-image': 'url("a.png")' })).visible,
        ).toBe(true);
    });

    it('applies format to the displayed value', () => {
        const resolved = resolveProperty(findProperty('color'), ctxOf({ color: 'rgb(0, 0, 0)' }));
        expect(resolved.value).toBe('#000000');
    });

    it('gates visibility with when()', () => {
        // list-style-type is shown only when there is no list-style-image.
        const property = findProperty('list-style-type');
        expect(resolveProperty(property, ctxOf({ 'list-style-image': 'none' })).visible).toBe(true);
        expect(
            resolveProperty(property, ctxOf({ 'list-style-image': 'url("dot.png")' })).visible,
        ).toBe(false);
    });
});

describe('catalog invariants', () => {
    it('never exposes panelOnly rows to the CSS dump', () => {
        // buildCssDefinition skips panelOnly; contrast is derived, not a real
        // CSS property, so it must never become a key in copied output.
        expect(findProperty('contrast').panelOnly).toBe(true);
    });

    it('treats properties as enabled unless explicitly disabled', () => {
        expect(isPropertyEnabled({ name: 'width' })).toBe(true);
        expect(isPropertyEnabled({ name: 'width', enabled: false })).toBe(false);
    });

    it('uses kebab-case names, so JSON copy keys are real CSS properties', () => {
        // buildJsonDefinition keys the map by property.name verbatim; camelCase
        // or synthetic names would produce keys no CSS tooling accepts.
        for (const category of CSS_CATEGORIES) {
            for (const property of category.properties) {
                if (property.panelOnly) continue;
                expect(property.name).toMatch(/^-{0,2}[a-z][a-z0-9-]*$/);
            }
        }
    });

    it('has no duplicate property names across categories', () => {
        // JSON copy flattens categories into one object — a duplicate name would
        // silently overwrite whichever entry came first.
        const seen = new Set<string>();
        for (const category of CSS_CATEGORIES) {
            for (const property of category.properties) {
                if (property.panelOnly) continue;
                expect(seen.has(property.name), `duplicate: ${property.name}`).toBe(false);
                seen.add(property.name);
            }
        }
    });
});

describe('border color helpers (diagram-only rows)', () => {
    it('formats a side color for display', () => {
        const ctx = borderCtx({ color: 'rgb(50, 115, 220)', style: 'solid', width: '4px' });
        expect(borderSideColor(ctx, 'top')).toBe('#3273DC');
    });

    it('detects uniform vs mixed border colors', () => {
        expect(
            borderColorsUniform(
                borderCtx({ color: 'rgb(50, 115, 220)', style: 'solid', width: '4px' }),
            ),
        ).toBe(true);
        expect(
            borderColorsUniform(
                borderCtx({
                    style: 'solid',
                    width: '4px',
                    color: {
                        top: 'rgb(255, 0, 0)',
                        right: 'rgb(0, 255, 0)',
                        bottom: 'rgb(255, 0, 0)',
                        left: 'rgb(255, 0, 0)',
                    },
                }),
            ),
        ).toBe(false);
    });

    it('detects any visible border style', () => {
        expect(hasVisibleBorder(borderCtx({ style: 'none' }))).toBe(false);
        expect(
            hasVisibleBorder(
                borderCtx({
                    style: { top: 'solid', right: 'none', bottom: 'none', left: 'none' },
                    color: 'rgb(0, 0, 0)',
                    width: '1px',
                }),
            ),
        ).toBe(true);
        // Zero-width borders do not paint — ignore them even when style is solid.
        expect(
            hasVisibleBorder(borderCtx({ style: 'solid', color: 'rgb(0, 0, 0)', width: '0px' })),
        ).toBe(false);
    });

    it('shows border-color when uniform and diagram-only catalog flags are set', () => {
        const property = findProperty('border-color');
        expect(property.diagramOnly).toBe(true);
        expect(property.panelOnly).toBe(true);

        const visible = borderCtx({
            style: 'solid',
            color: 'rgba(50, 115, 220, 0.3)',
            width: '4px',
        });
        const resolved = resolveProperty(property, visible);
        expect(resolved.visible).toBe(true);
        expect(resolved.value).toBe('rgba(50, 115, 220, 0.3)');

        expect(resolveProperty(property, borderCtx({ style: 'none' })).visible).toBe(false);
        expect(
            resolveProperty(
                property,
                borderCtx({ style: 'solid', color: 'rgba(0, 0, 0, 0)', width: '4px' }),
            ).visible,
        ).toBe(false);
        expect(
            resolveProperty(
                property,
                borderCtx({ style: 'solid', color: 'rgb(166, 132, 255)', width: '0px' }),
            ).visible,
        ).toBe(false);
    });

    it('hides the border shorthand when width is zero', () => {
        const property = findProperty('border');
        expect(
            resolveProperty(
                property,
                borderCtx({ style: 'solid', color: 'rgb(166, 132, 255)', width: '0px' }),
            ).visible,
        ).toBe(false);
        expect(
            resolveProperty(
                property,
                borderCtx({ style: 'solid', color: 'rgb(166, 132, 255)', width: '2px' }),
            ).visible,
        ).toBe(true);
    });

    it('shows per-side border-*-color when colors differ', () => {
        const mixed = borderCtx({
            style: 'solid',
            width: '2px',
            color: {
                top: 'rgb(255, 0, 0)',
                right: 'rgb(0, 128, 0)',
                bottom: 'rgb(255, 0, 0)',
                left: 'rgb(255, 0, 0)',
            },
        });
        expect(resolveProperty(findProperty('border-color'), mixed).visible).toBe(false);
        expect(resolveProperty(findProperty('border-top-color'), mixed).visible).toBe(true);
        expect(resolveProperty(findProperty('border-right-color'), mixed).value).toBe('#008000');
        expect(findProperty('border-top-color').diagramOnly).toBe(true);
    });
});
