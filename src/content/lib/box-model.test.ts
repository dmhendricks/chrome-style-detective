import { describe, expect, it } from 'vitest';
import {
    formatBoxLength,
    readBorderWidths,
    readBoxSides,
} from './box-model';

describe('formatBoxLength', () => {
    it('collapses 0px to 0', () => {
        expect(formatBoxLength('0px')).toBe('0');
    });

    it('rounds fractional px via removeExtraFloat', () => {
        expect(formatBoxLength('12.4px')).toBe('12px');
        expect(formatBoxLength('12.6px')).toBe('13px');
    });

    it('passes through non-px lengths', () => {
        expect(formatBoxLength('1.5em')).toBe('1.5em');
    });
});

describe('readBoxSides / readBorderWidths', () => {
    it('reads margin and padding sides', () => {
        const get = (name: string): string =>
            ({
                'margin-top': '10px',
                'margin-right': '0px',
                'margin-bottom': '10px',
                'margin-left': '0px',
                'padding-top': '4.2px',
                'padding-right': '8px',
                'padding-bottom': '4.2px',
                'padding-left': '8px',
            })[name] ?? '';

        expect(readBoxSides(get, 'margin')).toEqual({
            top: '10px',
            right: '0',
            bottom: '10px',
            left: '0',
        });
        expect(readBoxSides(get, 'padding')).toEqual({
            top: '4px',
            right: '8px',
            bottom: '4px',
            left: '8px',
        });
    });

    it('treats border-style none as 0 width', () => {
        const get = (name: string): string =>
            ({
                'border-top-style': 'solid',
                'border-top-width': '2px',
                'border-right-style': 'none',
                'border-right-width': '2px',
                'border-bottom-style': 'solid',
                'border-bottom-width': '2px',
                'border-left-style': 'none',
                'border-left-width': '2px',
            })[name] ?? '';

        expect(readBorderWidths(get)).toEqual({
            top: '2px',
            right: '0',
            bottom: '2px',
            left: '0',
        });
    });
});
