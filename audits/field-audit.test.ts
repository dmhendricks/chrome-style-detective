import { describe, expect, it } from 'vitest';
import { clusterFindings } from './field-audit';

function finding(
    overrides: Partial<{
        url: string;
        label: string;
        contrast: string;
        notes: string[];
        severity: 'investigate' | 'spot-check';
    }>,
) {
    return {
        url: 'https://example.com',
        tag: 'A',
        label: 'A "x"',
        chromeColor: 'rgb(0, 0, 0)',
        chromeBg: 'rgba(0, 0, 0, 0)',
        chromeBgImage: 'none',
        weShowColor: '#000000',
        weShowBg: 'transparent',
        weShowBgImage: 'none',
        contrast: 'n/a',
        notes: ['Contrast is n/a (gradient/url background or no opaque ancestor). Check visually if that feels right.'],
        severity: 'spot-check' as const,
        ...overrides,
    };
}

describe('clusterFindings', () => {
    it('collapses identical notes on the same URL', () => {
        const clustered = clusterFindings([
            finding({ label: 'A "one"' }),
            finding({ label: 'A "two"' }),
            finding({ label: 'A "three"' }),
        ]);
        expect(clustered).toHaveLength(1);
        expect(clustered[0]?.count).toBe(3);
        expect(clustered[0]?.examples).toEqual(['A "one"', 'A "two"', 'A "three"']);
    });

    it('keeps separate clusters for different notes or URLs', () => {
        const clustered = clusterFindings([
            finding({ label: 'A "a"', notes: ['note-a'] }),
            finding({ url: 'https://other.com', label: 'A "b"', notes: ['note-a'] }),
            finding({ label: 'A "c"', notes: ['note-b'] }),
            finding({ label: 'A "skip"', notes: [] }),
        ]);
        expect(clustered).toHaveLength(3);
    });

    it('sorts investigate ahead of spot-check', () => {
        const clustered = clusterFindings([
            finding({ notes: ['tier'], severity: 'spot-check' }),
            finding({
                notes: ['Could not parse color — panel may show a fallback.'],
                severity: 'investigate',
                label: 'SPAN "x"',
            }),
        ]);
        expect(clustered[0]?.severity).toBe('investigate');
        expect(clustered[1]?.severity).toBe('spot-check');
    });
});
