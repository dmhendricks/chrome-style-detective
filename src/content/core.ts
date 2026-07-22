/*!
 * Style Detective — content-script entry point.
 *
 * Wires the panel renderer (lib/panel) to hover events, manages enable/disable/
 * freeze state, and exposes the console-dump helper on globalThis so the service
 * worker's context-menu handler can call it. Bundled as a single IIFE by the
 * nested Vite build in vite.config.ts.
 */

import { CSS_CATEGORIES, propertiesFor } from './lib/properties';
import { createBlock, updatePanel } from './lib/panel';
import { selectorLabel } from './lib/dom';

// === Module state ===

// The element currently being inspected, and its generated CSS text. Updated on
// every mouseover; read by the context-menu console dump and the [c] key prompt.
let inspectedElement: HTMLElement | null = null;
let inspectedCssDefinition = '';
let outlinedElement: HTMLElement | null = null;

function currentDocument(): Document {
    return window.document;
}

// === CSS definition ===

// Appends `property: value;` lines for every property in `props` to the running
// CSS definition string.
function appendCssDefinition(style: CSSStyleDeclaration, props: readonly string[]): void {
    for (const property of props) {
        inspectedCssDefinition += '\t' + property + ': ' + style.getPropertyValue(property) + ';\n';
    }
}

// Build the full "simple CSS definition" string for the hovered element, walking
// every category in display order.
function buildCssDefinition(el: HTMLElement, style: CSSStyleDeclaration): string {
    inspectedCssDefinition =
        el.tagName.toLowerCase() +
        (el.id === '' ? '' : ' #' + el.id) +
        (el.className === '' ? '' : ' .' + el.className) +
        ' {\n';

    for (const category of CSS_CATEGORIES) {
        inspectedCssDefinition += `\n\t/* ${category.title} */\n`;
        appendCssDefinition(style, propertiesFor(category.key));
    }

    inspectedCssDefinition += '}';

    return inspectedCssDefinition;
}

// === Event handlers ===

// True if the element is the panel itself or lives inside it. The panel is
// appended to document.body, so AddEventListeners() attaches hover handlers to
// its own children too; without this guard, hovering the panel would re-inspect
// and reposition it, causing a flicker feedback loop (worst near the right edge,
// where small width changes flip the panel from one side of the cursor to the
// other every frame).
function isInsidePanel(el: HTMLElement | null): boolean {
    return !!el && !!el.closest && el.closest('#StyleDetectiveOverlay') != null;
}

function onMouseOver(this: HTMLElement, e: MouseEvent): void {
    // The hovered element is `this`; alias it so it can be stashed into module
    // state (inspectedElement) for the console dump and freeze features to read.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const el = this;

    if (isInsidePanel(el)) return;

    // Suppress the element's native title tooltip while inspecting — it renders
    // in browser chrome, outside the page's stacking context, so no z-index can
    // keep our panel above it. Stash the value and restore it on mouseout.
    if (el.hasAttribute('title')) {
        el.setAttribute('data-styledetective-title', el.getAttribute('title') ?? '');
        el.removeAttribute('title');
    }

    const document = currentDocument();
    const block = document.getElementById('StyleDetectiveOverlay');

    if (!block) return;

    // The header's first child is the selector label; set it as text (no markup).
    if (block.firstChild) {
        (block.firstChild as HTMLElement).textContent = selectorLabel(el);
    }

    // Outline element
    if (el.tagName != 'body') {
        el.style.outline = '1px dashed #f00';
        outlinedElement = el;
    }

    // Updating CSS properties
    if (!document.defaultView) return;
    const style = document.defaultView.getComputedStyle(el, null);

    updatePanel(style, el.tagName);

    inspectedElement = el;

    removeElement('styleDetectiveInsertMessage');

    e.stopPropagation();

    buildCssDefinition(el, style);
}

function onMouseOut(this: HTMLElement, e: MouseEvent): void {
    if (isInsidePanel(this)) return;

    this.style.outline = '';

    // Restore the native title we suppressed on mouseover.
    if (this.hasAttribute('data-styledetective-title')) {
        this.setAttribute('title', this.getAttribute('data-styledetective-title') ?? '');
        this.removeAttribute('data-styledetective-title');
    }

    e.stopPropagation();
}

function onMouseMove(this: HTMLElement, e: MouseEvent): void {
    if (isInsidePanel(this)) return;

    const block = currentDocument().getElementById('StyleDetectiveOverlay');

    if (!block) return;

    block.style.display = 'block';

    const pageWidth = window.innerWidth;
    // Keep the panel clear of the browser's link-URL preview, which the browser
    // draws in the bottom-left of the viewport when hovering a link. Reserve a
    // strip at the bottom so the panel never extends into it.
    const BOTTOM_MARGIN = 40;
    const pageHeight = window.innerHeight - BOTTOM_MARGIN;
    // Measure the actual rendered size — the panel grows wider than a fixed
    // width for long values, so a hardcoded width mispositions it near the edge.
    const blockWidth = block.offsetWidth;
    const blockHeight = block.offsetHeight;

    if (e.pageX + blockWidth > pageWidth) {
        if (e.pageX - blockWidth - 10 > 0) block.style.left = e.pageX - blockWidth - 40 + 'px';
        else block.style.left = 0 + 'px';
    } else block.style.left = e.pageX + 20 + 'px';

    if (e.pageY + blockHeight > pageHeight) {
        if (e.pageY - blockHeight - 10 > 0) block.style.top = e.pageY - blockHeight - 20 + 'px';
        else block.style.top = 0 + 'px';
    } else block.style.top = e.pageY + 20 + 'px';

    // adapt block top to screen offset
    if (!isElementInViewport(block)) block.style.top = window.pageYOffset + 20 + 'px';

    e.stopPropagation();
}

// http://stackoverflow.com/a/7557433
function isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// === Notification message ===

// Display the notification message.
function insertMessage(msg: string): void {
    const p = document.createElement('p');

    p.appendChild(document.createTextNode(msg));
    p.id = 'styleDetectiveInsertMessage';
    p.style.backgroundColor = '#b40000';
    p.style.color = '#ffffff';
    p.style.position = 'fixed';
    p.style.top = '10px';
    p.style.left = '10px';
    p.style.zIndex = '9999';
    p.style.padding = '3px';

    document.body.appendChild(p);
}

// Removes an element from the DOM, used to remove the notification message.
function removeElement(divid: string): void {
    const n = document.getElementById(divid);
    if (n) document.body.removeChild(n);
}

// === Overlay controller ===

class StyleDetectiveOverlay {
    // Whether all elements currently have the hover event listeners attached.
    haveEventListeners = false;

    // Build the panel and show the "loaded" notification.
    createBlock(): HTMLElement {
        const block = createBlock(
            currentDocument(),
            'Style Detective 1.8.0. Keys: [F] Un/Freeze • [C] Copy • [Esc] Close',
        );

        insertMessage('Style Detective loaded! Hover any element you want to inspect in the page.');

        return block;
    }

    // Get all elements within the given element
    getAllElements(element: Node | null): HTMLElement[] {
        let elements: HTMLElement[] = [];

        if (element && element.hasChildNodes()) {
            elements.push(element as HTMLElement);

            const childs = element.childNodes;

            for (let i = 0; i < childs.length; i++) {
                const child = childs[i]!;
                if (child.hasChildNodes()) {
                    elements = elements.concat(this.getAllElements(child));
                } else if (child.nodeType == 1) {
                    elements.push(child as HTMLElement);
                }
            }
        }

        return elements;
    }

    // Add event listeners for all elements in the current document
    addEventListeners(): void {
        const elements = this.getAllElements(currentDocument().body);

        for (const element of elements) {
            element.addEventListener('mouseover', onMouseOver, false);
            element.addEventListener('mouseout', onMouseOut, false);
            element.addEventListener('mousemove', onMouseMove, false);
        }
        this.haveEventListeners = true;
    }

    // Remove event listeners for all elements in the current document
    removeEventListeners(): void {
        const elements = this.getAllElements(currentDocument().body);

        for (const element of elements) {
            element.removeEventListener('mouseover', onMouseOver, false);
            element.removeEventListener('mouseout', onMouseOut, false);
            element.removeEventListener('mousemove', onMouseMove, false);
        }
        this.haveEventListeners = false;
    }

    // Check whether the overlay is enabled
    isEnabled(): boolean {
        return currentDocument().getElementById('StyleDetectiveOverlay') != null;
    }

    // Enable the overlay
    enable(): boolean {
        const document = currentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');

        if (!block) {
            document.body.appendChild(this.createBlock());
            this.addEventListeners();

            return true;
        }

        return false;
    }

    // Disable the overlay
    disable(): boolean {
        const document = currentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');
        const message = document.getElementById('styleDetectiveInsertMessage');

        if (block || message) {
            if (block) document.body.removeChild(block);
            if (message) document.body.removeChild(message);
            this.removeEventListeners();

            // Restore any titles still suppressed because the viewer was disabled
            // while an element was hovered (mouseout never fired for it).
            for (const el of document.querySelectorAll('[data-styledetective-title]')) {
                el.setAttribute('title', el.getAttribute('data-styledetective-title') ?? '');
                el.removeAttribute('data-styledetective-title');
            }

            return true;
        }

        return false;
    }

    // Freeze the overlay (stop tracking the cursor)
    freeze(): boolean {
        const block = currentDocument().getElementById('StyleDetectiveOverlay');
        if (block && this.haveEventListeners) {
            this.removeEventListeners();

            return true;
        }

        return false;
    }

    // Unfreeze the overlay
    unfreeze(): boolean {
        const block = currentDocument().getElementById('StyleDetectiveOverlay');
        if (block && !this.haveEventListeners) {
            // Remove the red outline
            if (outlinedElement) outlinedElement.style.outline = '';
            this.addEventListeners();

            return true;
        }

        return false;
    }
}

// === Console dump ===

// Copy the current element's CSS to the console. Called by the service worker's
// context-menu handler (see globalThis assignment at the end of this file).
function copyCssToConsole(type: string): void {
    if (!inspectedElement) return;
    const view = document.defaultView;

    if (type == 'el') console.log(inspectedElement);
    else if (type == 'id') console.log(inspectedElement.id);
    else if (type == 'tagName') console.log(inspectedElement.tagName);
    else if (type == 'className') console.log(inspectedElement.className);
    else if (type == 'style') console.log(inspectedElement.style);
    else if (type == 'cssText' && view)
        console.log(view.getComputedStyle(inspectedElement, null).cssText);
    else if (type == 'getComputedStyle' && view)
        console.log(view.getComputedStyle(inspectedElement, null));
    else if (type == 'simpleCssDefinition') console.log(inspectedCssDefinition);
}

// === Keymap ===

// Close the viewer on [Esc], freeze/unfreeze on [f], show CSS on [c].
function keyMap(e: KeyboardEvent): void {
    if (!overlay.isEnabled()) return;

    // ESC: Close the css viewer.
    if (e.keyCode === 27) {
        if (outlinedElement) outlinedElement.style.outline = '';
        overlay.disable();
    }

    if (e.altKey || e.ctrlKey) return;

    // f: Freeze or Unfreeze the css viewer.
    if (e.keyCode === 70) {
        if (overlay.haveEventListeners) overlay.freeze();
        else overlay.unfreeze();
    }

    // c: Show css for selected element. window.prompt should suffice for now.
    if (e.keyCode === 67) {
        window.prompt(
            'Simple Css Definition :\n\nYou may copy the code below then hit escape to continue.',
            inspectedCssDefinition,
        );
    }
}

// === Entry point ===

// Toggle the viewer on (re-)injection.
const overlay = new StyleDetectiveOverlay();

if (overlay.isEnabled()) {
    overlay.disable();
} else {
    overlay.enable();
}

document.onkeydown = keyMap;

// The build wraps this file in an IIFE, so top-level functions no longer attach
// to the page's global scope automatically. The context-menu handler in the
// service worker injects a separate function that calls this by name, so expose
// it explicitly. It closes over the same inspectedElement that hovering updates.
(globalThis as Record<string, unknown>).styleDetectiveCopyCssToConsole = copyCssToConsole;
