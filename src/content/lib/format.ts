/*!
 * Style Detective — pure formatting helpers for CSS values.
 *
 * These take raw computed-style strings and normalize them for display. They do
 * no DOM work (see dom.ts for the colour-swatch element built from `rgbToHex`).
 */

/** Convert a 0–255 channel to a two-digit uppercase hex pair. */
export function decToHex(nb: number): string {
    // Clamp to a whole byte so a fractional or out-of-range value (e.g. an
    // alpha channel like 0.067) can't produce a malformed hex pair.
    const byte = Math.max(0, Math.min(255, Math.round(nb)));

    return byte.toString(16).toUpperCase().padStart(2, '0');
}

export interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Parse an `rgb()`/`rgba()` computed color (comma- or space-separated) into
 * channels. Returns null if the string isn't a usable rgb color.
 */
export function parseCssColor(str: string): RgbaColor | null {
    const start = str.indexOf('(');
    const end = str.indexOf(')');
    if (start < 0 || end < 0) return null;

    const body = str.slice(start + 1, end).trim();
    // "101, 108, 118, 0.067" or "101 108 118 / 0.067"
    const parts = body.includes(',')
        ? body.split(',').map((part) => part.trim())
        : body
              .replace('/', ' ')
              .split(/\s+/)
              .filter(Boolean);

    if (parts.length < 3) return null;

    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;

    if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;

    return { r, g, b, a };
}

/**
 * Convert an `rgb()`/`rgba()` string to a `#RRGGBB` hex string. Pure black is
 * remapped to white so a swatch stays visible against the panel background.
 */
export function rgbToHex(str: string): string {
    const color = parseCssColor(str);
    if (!color) return '#FFFFFF';

    let hexStr = '#' + decToHex(color.r) + decToHex(color.g) + decToHex(color.b);

    if (hexStr === '#000000') {
        hexStr = '#FFFFFF';
    }

    return hexStr;
}

/** WCAG relative luminance for an sRGB color. */
export function relativeLuminance(color: RgbaColor): number {
    const channel = (value: number): number => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** Blend `src` over opaque `dst` (both 0–255 channels, src.a in 0–1). */
export function alphaBlend(src: RgbaColor, dst: RgbaColor): RgbaColor {
    const a = Math.max(0, Math.min(1, src.a));
    return {
        r: Math.round(src.r * a + dst.r * (1 - a)),
        g: Math.round(src.g * a + dst.g * (1 - a)),
        b: Math.round(src.b * a + dst.b * (1 - a)),
        a: 1,
    };
}

const OPAQUE_WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

/** WCAG contrast ratio between two opaque colors (1–21). */
export function contrastRatio(foreground: RgbaColor, background: RgbaColor): number {
    const l1 = relativeLuminance(foreground);
    const l2 = relativeLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
}

/** Short WCAG label for a contrast ratio against normal text thresholds. */
export function contrastLabel(ratio: number): string {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'AA large';
    return 'fail';
}

export type ContrastTone = 'aaa' | 'aa' | 'aa-large' | 'fail';

export function contrastTone(label: string): ContrastTone {
    if (label === 'AAA') return 'aaa';
    if (label === 'AA') return 'aa';
    if (label === 'AA large') return 'aa-large';
    return 'fail';
}

export interface TextContrast {
    ratio: number;
    label: string;
    tone: ContrastTone;
}

/**
 * Contrast of `color` on `background-color`, flattening partial alpha over white
 * then compositing the foreground over that backdrop (practical page estimate).
 */
export function textContrast(foregroundCss: string, backgroundCss: string): TextContrast | null {
    const fg = parseCssColor(foregroundCss);
    const bg = parseCssColor(backgroundCss);
    if (!fg || !bg) return null;

    const bgFlat = alphaBlend(bg, OPAQUE_WHITE);
    const fgFlat = alphaBlend(fg, bgFlat);
    const ratio = contrastRatio(fgFlat, bgFlat);
    if (!Number.isFinite(ratio)) return null;

    const label = contrastLabel(ratio);
    return { ratio, label, tone: contrastTone(label) };
}

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x || 1;
}

/**
 * Format a rendered box's aspect ratio. Prefer a simplified `W:H`; fall back to
 * a decimal when the simplified form is unwieldy (e.g. 857:17).
 */
export function formatAspectRatio(width: number, height: number): string {
    if (width <= 0 || height <= 0) return '';

    const w = Math.round(width);
    const h = Math.round(height);
    const g = gcd(w, h);
    const rw = w / g;
    const rh = h / g;

    if (rw > 40 || rh > 40) return (w / h).toFixed(2);

    return `${rw}:${rh}`;
}

/** Extract the file name from a `url(...)` value (used for background images). */
export function getFileName(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end);

    const path = str.split('/');

    return path[path.length - 1] ?? '';
}

/** Round a `"12.34px"`-style value to a whole-pixel string; pass through otherwise. */
export function removeExtraFloat(nb: string): string {
    if (!nb.endsWith('px')) return nb;

    const n = Number.parseFloat(nb);
    if (!Number.isFinite(n)) return nb;

    return `${Math.round(n)}px`;
}
