/*!
 * Class-token helpers for the Classes row.
 */

import { elementClassName } from './dom';

/** Split the element's class attribute into non-empty tokens. */
export function parseClassTokens(el: Element): string[] {
    const raw = elementClassName(el).trim();
    if (raw === '') return [];
    return raw.split(/\s+/).filter(Boolean);
}

/** Space-separated class string suitable for clipboard / className. */
export function formatClassesForCopy(tokens: readonly string[]): string {
    return tokens.join(' ');
}

/**
 * How many flex/wrap rows the chip container currently occupies (via offsetTop).
 * Used to cap the expanded list at three lines before showing "+N more".
 */
export function countChipRows(container: HTMLElement): number {
    const tops = new Set<number>();
    for (const child of container.children) {
        if (child instanceof HTMLElement) tops.add(child.offsetTop);
    }
    return tops.size;
}
