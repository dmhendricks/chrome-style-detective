/*!
 * Style Detective — pure formatting helpers for CSS values.
 *
 * These take raw computed-style strings and normalize them for display. They do
 * no DOM work (see dom.ts for the colour-swatch element built from `rgbToHex`).
 */

/** True if `name` is present in `array`. */
export function isInArray(array: readonly string[], name: string): boolean {
    return array.includes(name);
}

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

/** Round a `"12.34px"`-style value to a whole-pixel string. */
export function removeExtraFloat(nb: string): string {
    return Math.round(Number(nb.substr(0, nb.length - 2))) + 'px';
}
