import { describe, expect, it } from 'vitest';
import {
    alphaBlend,
    compositeBackgroundLayers,
    contrastLabel,
    contrastRatio,
    formatBackgroundImage,
    formatCssColorDisplay,
    parseCssColor,
    rgbToHex,
    textContrast,
    type RgbaColor,
} from './format';

function rgb(r: number, g: number, b: number, a = 1): RgbaColor {
    return { r, g, b, a };
}

describe('parseCssColor / formatCssColorDisplay', () => {
    it('parses classic rgb and rgba', () => {
        expect(parseCssColor('rgb(101, 108, 118)')).toEqual(rgb(101, 108, 118));
        expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toMatchObject({ r: 0, g: 0, b: 0, a: 0.5 });
    });

    it('shows transparent instead of remapping to white', () => {
        expect(formatCssColorDisplay('rgba(0, 0, 0, 0)')).toBe('transparent');
        expect(formatCssColorDisplay('transparent')).toBe('transparent');
    });

    it('keeps pure black as #000000 in the value text', () => {
        expect(formatCssColorDisplay('rgb(0, 0, 0)')).toBe('#000000');
    });

    it('rgbToHex returns empty string when unparseable (not fake white)', () => {
        expect(rgbToHex('not-a-color')).toBe('');
        expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000');
    });

    it('emits rgba() for partial alpha (not funky 8-digit hex)', () => {
        // PostHog-style highlight: blue at 10% opacity
        expect(formatCssColorDisplay('rgba(47, 128, 250, 0.1)')).toBe(
            'rgba(47, 128, 250, 0.1)',
        );
        expect(formatCssColorDisplay('rgba(101, 108, 118, 0.2)')).toBe(
            'rgba(101, 108, 118, 0.2)',
        );
    });

    it('parses modern color() / oklch', () => {
        const p3 = parseCssColor('color(srgb 0.728235 0.209412 0.227059)');
        expect(p3).not.toBeNull();
        expect(p3!.r).toBeGreaterThan(180);
        expect(formatCssColorDisplay('oklch(0.7 0.15 250)')).toMatch(/^#[0-9A-F]{6}$/);
    });
});

describe('formatBackgroundImage', () => {
    it('formats solid color(...) images as hex', () => {
        expect(formatBackgroundImage('color(srgb 0.728235 0.209412 0.227059)')).toMatch(
            /^#[0-9A-F]{6}$/,
        );
    });

    it('keeps gradients as raw strings', () => {
        expect(formatBackgroundImage('linear-gradient(red, blue)')).toBe(
            'linear-gradient(red, blue)',
        );
    });

    it('shows the full URL, not just the file name', () => {
        expect(
            formatBackgroundImage(
                'url("https://media.townhall.com/cdn/hodl/2026/194/8111978c-5bb2-42d5-bb24-768f8843d900-180x180.jpg")',
            ),
        ).toBe(
            'https://media.townhall.com/cdn/hodl/2026/194/8111978c-5bb2-42d5-bb24-768f8843d900-180x180.jpg',
        );
    });
});

describe('contrast / compositing', () => {
    it('labels WCAG thresholds', () => {
        expect(contrastLabel(7)).toBe('AAA');
        expect(contrastLabel(4.5)).toBe('AA');
        expect(contrastLabel(3)).toBe('AA large');
        expect(contrastLabel(2.9)).toBe('fail');
    });

    it('composites translucent chip over dark page like GitHub dark UI', () => {
        const chip = rgb(101, 108, 118, 0.2); // #656C7633
        const page = rgb(13, 17, 23); // ~#0D1117
        const effective = compositeBackgroundLayers([chip, page]);
        expect(effective).not.toBeNull();

        const fg = rgb(0xf0, 0xf6, 0xfc); // #F0F6FC
        const ratio = contrastRatio(fg, effective!);
        // Light text on dark effective bg — high contrast, not ~1:1
        expect(ratio).toBeGreaterThan(10);
        expect(contrastLabel(ratio)).toBe('AAA');
    });

    it('returns null when there is no opaque base (do not guess white)', () => {
        expect(compositeBackgroundLayers([rgb(101, 108, 118, 0.2)])).toBeNull();
    });

    it('textContrast matches compositing against a resolved background', () => {
        const bg = alphaBlend(rgb(101, 108, 118, 0.2), rgb(13, 17, 23));
        const result = textContrast('rgb(240, 246, 252)', bg);
        expect(result).not.toBeNull();
        expect(result!.ratio).toBeGreaterThan(10);
        expect(result!.label).toBe('AAA');
    });

    it('near-white on white fails', () => {
        const result = textContrast('rgb(246, 248, 254)', rgb(255, 255, 255));
        expect(result?.label).toBe('fail');
        expect(result!.ratio).toBeLessThan(1.2);
    });
});
