/*!
 * Style Detective — typed DOM construction helpers.
 *
 * Replaces the original string-concatenated `innerHTML` with typed element
 * builders, so nothing on the host page can be affected by unescaped markup and
 * the panel's structure is expressed as real nodes.
 */

/** Tag names we construct, mapped to their element types for `el()`. */
type TagName = keyof HTMLElementTagNameMap;

interface ElOptions {
    id?: string;
    className?: string;
    text?: string;
    children?: Node[];
}

/** Create an element with optional id/class/text/children in one call. */
export function el<K extends TagName>(
    doc: Document,
    tag: K,
    opts: ElOptions = {},
): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);

    if (opts.id !== undefined) node.id = opts.id;
    if (opts.className !== undefined) node.className = opts.className;
    if (opts.text !== undefined) node.appendChild(doc.createTextNode(opts.text));
    if (opts.children) {
        for (const child of opts.children) node.appendChild(child);
    }

    return node;
}

/**
 * Build the small colour swatch shown next to a colour value. Replaces the
 * inline-`<span style=...>` HTML the original `RGBToHex` returned as a string.
 */
export function colorSwatch(doc: Document, hex: string): HTMLSpanElement {
    const swatch = doc.createElement('span');
    const s = swatch.style;

    s.setProperty('border', '1px solid #000000', 'important');
    s.setProperty('width', '8px', 'important');
    s.setProperty('height', '8px', 'important');
    s.setProperty('display', 'inline-block', 'important');
    s.setProperty('background-color', hex, 'important');

    return swatch;
}

/**
 * Build the `<tag> #id .class` selector label shown in the panel header and used
 * for the CSS-definition selector line. Text nodes only — no markup injection.
 */
export function selectorLabel(el: HTMLElement): string {
    return (
        el.tagName +
        (el.id === '' ? '' : ' #' + el.id) +
        (el.className === '' ? '' : ' .' + el.className)
    );
}

/**
 * Replace an element's contents with `" : "` followed by a value that may be a
 * plain string or a Node (e.g. a colour swatch + hex text fragment).
 */
export function setValueContent(target: HTMLElement, value: string | Node): void {
    target.textContent = ' : ';
    if (typeof value === 'string') {
        target.appendChild(target.ownerDocument.createTextNode(value));
    } else {
        target.appendChild(value);
    }
}
