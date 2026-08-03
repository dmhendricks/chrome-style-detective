import { describe, expect, it } from 'vitest';
import {
    asHtmlElement,
    isComposedDescendant,
    pierceOpenShadow,
    SHADOW_PIERCE_MAX_DEPTH,
} from './dom';

describe('pierceOpenShadow', () => {
    it('returns the start element when there is no shadowRoot', () => {
        const start = { shadowRoot: null } as unknown as Element;
        expect(pierceOpenShadow(start, 10, 20)).toBe(start);
    });

    it('drills into an open shadow root at the point', () => {
        const inner = { shadowRoot: null, tagName: 'SPAN' } as unknown as Element;
        const host = {
            shadowRoot: {
                elementFromPoint: (x: number, y: number) => {
                    expect(x).toBe(12);
                    expect(y).toBe(34);
                    return inner;
                },
            },
        } as unknown as Element;

        expect(pierceOpenShadow(host, 12, 34)).toBe(inner);
    });

    it('stops when elementFromPoint returns the host again', () => {
        const host = {
            shadowRoot: {
                elementFromPoint: () => host,
            },
        } as unknown as Element;

        expect(pierceOpenShadow(host, 0, 0)).toBe(host);
    });

    it('respects max depth across nested shadows', () => {
        const deepest = { shadowRoot: null } as unknown as Element;
        let level = deepest;
        for (let i = 0; i < SHADOW_PIERCE_MAX_DEPTH + 3; i++) {
            const inner = level;
            level = {
                shadowRoot: {
                    elementFromPoint: () => inner,
                },
            } as unknown as Element;
        }

        const pierced = pierceOpenShadow(level, 1, 1, SHADOW_PIERCE_MAX_DEPTH);
        // After maxDepth drills we should not have reached the absolute deepest.
        expect(pierced).not.toBe(deepest);
        expect(pierced.shadowRoot).toBeTruthy();
    });
});

describe('isComposedDescendant', () => {
    it('is true for the node itself', () => {
        const node = { parentNode: null } as unknown as Node;
        expect(isComposedDescendant(node, node)).toBe(true);
    });

    it('walks parentNode chains', () => {
        const grand = { parentNode: null } as unknown as Node;
        const parent = { parentNode: grand } as unknown as Node;
        const child = { parentNode: parent } as unknown as Node;
        expect(isComposedDescendant(grand, child)).toBe(true);
        expect(isComposedDescendant(child, grand)).toBe(false);
    });

    it('crosses ShadowRoot.host when parentNode is null', () => {
        const host = { parentNode: null } as unknown as Node;
        const shadowRoot = { parentNode: null, host } as unknown as ShadowRoot;
        const token = { parentNode: shadowRoot } as unknown as Node;
        expect(isComposedDescendant(host, token)).toBe(true);
        expect(isComposedDescendant(token, host)).toBe(false);
    });
});

describe('asHtmlElement', () => {
    it('returns null for null', () => {
        expect(asHtmlElement(null)).toBeNull();
    });
});
