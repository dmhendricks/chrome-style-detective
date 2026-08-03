/*!
 * Style Detective — pure formatting helpers for CSS values.
 *
 * These take raw computed-style / color strings and normalize them for display.
 * DOM walks for effective backgrounds live in properties.ts; swatch remapping
 * of pure black for panel visibility lives in dom.ts.
 */

import { converter, parse } from 'culori';

const toRgb = converter('rgb');

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
 * Parse a CSS color string into sRGB channels (0–255) plus alpha.
 * Accepts rgb/rgba, hex, named colors, hsl, lab, oklch, color(), etc.
 */
export function parseCssColor(str: string): RgbaColor | null {
    const parsed = parse(str.trim());
    if (!parsed) return null;

    const rgb = toRgb(parsed);
    if (rgb?.r == null || rgb.g == null || rgb.b == null) return null;

    const a = rgb.alpha ?? 1;
    if (!Number.isFinite(a)) return null;

    return {
        r: Math.max(0, Math.min(255, Math.round(rgb.r * 255))),
        g: Math.max(0, Math.min(255, Math.round(rgb.g * 255))),
        b: Math.max(0, Math.min(255, Math.round(rgb.b * 255))),
        a,
    };
}

/** True when the color contributes no paint (fully transparent). */
export function isFullyTransparent(color: RgbaColor): boolean {
    return color.a <= 0;
}

/**
 * Convert a CSS color string to a `#RRGGBB` hex string. Fully transparent
 * colors become `#000000` at zero alpha in parsing — callers that need a
 * human label should use `formatCssColorDisplay` instead.
 * Returns an empty string when the color cannot be parsed (do not invent white).
 */
export function rgbToHex(str: string): string {
    const color = parseCssColor(str);
    if (!color) return '';

    return '#' + decToHex(color.r) + decToHex(color.g) + decToHex(color.b);
}

/**
 * Panel display for a computed color: `transparent` when alpha is 0,
 * `#RRGGBB` when opaque, otherwise familiar `rgba(r, g, b, a)` (not 8-digit hex).
 */
export function formatCssColorDisplay(str: string): string {
    const color = parseCssColor(str);
    if (!color) return str.trim() || '';

    if (isFullyTransparent(color)) return 'transparent';

    const hex = '#' + decToHex(color.r) + decToHex(color.g) + decToHex(color.b);
    if (color.a >= 1) return hex;

    // Keep alpha readable — most people know rgba(), not #RRGGBBAA.
    const alpha = Number((Math.round(color.a * 1000) / 1000).toFixed(3));
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/**
 * Composite background layers listed top→bottom (nearest ancestor first).
 * Returns null when there is no opaque base (contrast would be a guess).
 */
export function compositeBackgroundLayers(layersTopFirst: readonly RgbaColor[]): RgbaColor | null {
    if (layersTopFirst.length === 0) return null;

    const base = layersTopFirst[layersTopFirst.length - 1]!;
    if (base.a < 1) return null;

    let result: RgbaColor = { r: base.r, g: base.g, b: base.b, a: 1 };
    for (let i = layersTopFirst.length - 2; i >= 0; i--) {
        result = alphaBlend(layersTopFirst[i]!, result);
    }
    return result;
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
 * WCAG contrast of a foreground CSS color against an already-resolved opaque
 * (or flattened) background. Returns null when the foreground cannot be parsed.
 */
export function textContrast(foregroundCss: string, background: RgbaColor): TextContrast | null {
    const fg = parseCssColor(foregroundCss);
    if (!fg) return null;

    const bgFlat =
        background.a >= 1
            ? { r: background.r, g: background.g, b: background.b, a: 1 }
            : alphaBlend(background, OPAQUE_WHITE);
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

/** Extract the file name from a `url(...)` value (legacy helper). */
export function getFileName(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end).replaceAll(/['"]/g, '');

    const path = str.split('/');

    return path[path.length - 1] ?? '';
}

/** URLs inside one or more `url(...)` tokens, quotes stripped. */
export function extractCssUrls(str: string): string[] {
    const urls: string[] = [];
    for (const match of str.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        const inner = match[2]?.trim();
        if (inner) urls.push(inner);
    }
    return urls;
}

/** Max length for a data: URL before the panel collapses it to `data:…`. */
const DATA_URL_DISPLAY_MAX = 48;

/** Panel placeholder for a truncated data: URL. */
export const DATA_URL_DISPLAY_PLACEHOLDER = 'data:…';

/**
 * Collapse a long `data:` URL for panel display. Short data URLs and non-data
 * URLs are returned unchanged.
 */
export function truncateDataUrl(
    url: string,
    maxLength: number = DATA_URL_DISPLAY_MAX,
): string {
    if (!/^data:/i.test(url) || url.length <= maxLength) return url;
    return DATA_URL_DISPLAY_PLACEHOLDER;
}

/**
 * Replace long `data:` payloads inside `url(...)` tokens for panel display.
 * Preserves fallbacks and other list items (e.g. `url("data:…"), move`).
 * Display-only — copy should keep the raw computed value.
 */
export function truncateCssDataUrls(str: string): string {
    return str.replace(
        /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
        (full, quote: string, inner: string) => {
            const url = inner.trim();
            const truncated = truncateDataUrl(url);
            if (truncated === url) return full;
            const q = quote || '"';
            return `url(${q}${truncated}${q})`;
        },
    );
}

/**
 * Panel display for background-image: hex/rgba for solid `color(...)` layers,
 * full URL(s) for url(...), otherwise the raw computed string (gradients, etc.).
 */
export function formatBackgroundImage(str: string): string {
    const trimmed = str.trim();
    if (!trimmed || trimmed === 'none') return trimmed;

    const solid = parseCssColor(trimmed);
    if (solid) return formatCssColorDisplay(trimmed);

    if (/url\s*\(/i.test(trimmed)) {
        const urls = extractCssUrls(trimmed);
        return urls.length > 0
            ? urls.map((url) => truncateDataUrl(url)).join(', ')
            : trimmed;
    }

    return trimmed;
}

/** Round a `"12.34px"`-style value to a whole-pixel string; pass through otherwise. */
export function removeExtraFloat(nb: string): string {
    if (!nb.endsWith('px')) return nb;

    const n = Number.parseFloat(nb);
    if (!Number.isFinite(n)) return nb;

    return `${Math.round(n)}px`;
}

/** Start of a CSS gradient function (linear / radial / conic, optional repeating-). */
const GRADIENT_START_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i;

/**
 * First `*-gradient(...)` in a CSS value, balanced across nested parentheses
 * (e.g. color stops like `rgb(...)`). Returns null when none is present.
 */
export function extractFirstCssGradient(str: string): string | null {
    const match = GRADIENT_START_RE.exec(str);
    if (!match || match.index == null) return null;

    const start = match.index;
    let depth = 0;
    for (let i = start; i < str.length; i++) {
        const ch = str[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
            depth -= 1;
            if (depth === 0) return str.slice(start, i + 1);
        }
    }
    return null;
}
