import { describe, expect, it } from 'vitest';
import {
    CSS_CATEGORIES,
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

function findProperty(name: string): CssProperty {
    for (const category of CSS_CATEGORIES) {
        for (const property of category.properties) {
            if (property.name === name) return property;
        }
    }
    throw new Error(`property not in catalog: ${name}`);
}

/**
 * Mirrors the value selection in `buildCssDefinition` (core.ts): synthesized
 * `value()` and `copySafe` formatters win; other `format` helpers are skipped
 * in favour of the raw computed value.
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
});
