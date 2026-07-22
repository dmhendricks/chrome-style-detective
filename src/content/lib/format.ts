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

/**
 * Convert an `rgb()`/`rgba()` string to a `#RRGGBB` hex string. Pure black is
 * remapped to white so a swatch stays visible against the panel background.
 */
export function rgbToHex(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end);

    // Modern browsers report colors as rgb()/rgba() and may include a 4th alpha
    // component (e.g. "rgba(101, 108, 118, 0.067)"). Only the first three are
    // RGB channels; take those and ignore any alpha.
    const rgbValues = str.split(',').slice(0, 3);
    let hexStr = '#';

    for (const value of rgbValues) {
        hexStr += decToHex(Number(value));
    }

    if (hexStr === '#000000') {
        hexStr = '#FFFFFF';
    }

    return hexStr;
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
