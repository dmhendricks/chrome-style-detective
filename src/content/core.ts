/*!
 * Style Detective — content-script entry point.
 *
 * Declared in the manifest and loaded dormant on matching pages. The service
 * worker toggles the overlay via a runtime message. One OverlayController owns
 * prefs, listeners, highlight, and inspect state; this module only boots it.
 */

import { copyTextToClipboard } from './lib/clipboard';
import { elementClassName } from './lib/dom';
import { CSS_CATEGORIES, propertiesFor } from './lib/properties';
import {
    createBlock,
    collapseSelectorHeader,
    refreshSelectorOverflow,
    updateHeader,
    updatePanel,
} from './lib/panel';
import './style.scss';

const FROZEN_CLASS = 'StyleDetectiveOverlay--frozen';
const DARK_CLASS = 'StyleDetectiveOverlay--dark';
const HIGHLIGHT_ID = 'StyleDetectiveHighlight';
const OVERLAY_ID = 'StyleDetectiveOverlay';
const TOAST_ID = 'styleDetectiveInsertMessage';

const PANEL_FONT_SIZE_DEFAULT = 10;
const PANEL_FONT_SIZE_MIN = 8;
const PANEL_FONT_SIZE_MAX = 18;
const PANEL_FONT_SIZE_STEP = 1;
const PANEL_FONT_SIZE_STORAGE_KEY = 'panelFontSize';
const PANEL_THEME_STORAGE_KEY = 'panelTheme';

type PanelTheme = 'light' | 'dark';
type Pointer = { clientX: number; clientY: number; pageX: number; pageY: number };

const HOVER_LISTENER_OPTS: AddEventListenerOptions = { capture: true, passive: true };
const HIGHLIGHT_LAYOUT_OPTS: AddEventListenerOptions = { capture: true, passive: true };
const POINTER_TRACK_OPTS: AddEventListenerOptions = { capture: true, passive: true };

function clampPanelFontSize(size: number): number {
    return Math.min(PANEL_FONT_SIZE_MAX, Math.max(PANEL_FONT_SIZE_MIN, size));
}

function systemPanelTheme(): PanelTheme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function eventTargetElement(e: Event): HTMLElement | null {
    const target = e.target;
    if (target instanceof HTMLElement) return target;
    if (target instanceof Node) return target.parentElement;

    return null;
}

function isInsidePanel(el: HTMLElement | null): boolean {
    return !!el && !!el.closest && el.closest(`#${OVERLAY_ID}`) !== null;
}

function isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/** Shift an absolutely-positioned panel so its box stays inside the viewport. */
function keepPanelInViewport(block: HTMLElement): void {
    const MARGIN = 8;
    const BOTTOM_MARGIN = 40;
    const rect = block.getBoundingClientRect();

    let dx = 0;
    let dy = 0;

    if (rect.right > window.innerWidth - MARGIN) {
        dx = window.innerWidth - MARGIN - rect.right;
    }
    if (rect.left + dx < MARGIN) {
        dx = MARGIN - rect.left;
    }
    if (rect.bottom > window.innerHeight - BOTTOM_MARGIN) {
        dy = window.innerHeight - BOTTOM_MARGIN - rect.bottom;
    }
    if (rect.top + dy < MARGIN) {
        dy = MARGIN - rect.top;
    }

    if (dx !== 0) {
        block.style.left = `${block.offsetLeft + dx}px`;
    }
    if (dy !== 0) {
        block.style.top = `${block.offsetTop + dy}px`;
    }
}

function removeElement(id: string): void {
    const n = document.getElementById(id);
    if (n) n.parentNode?.removeChild(n);
}

/** Build a simple CSS definition string for an element (used only on copy). */
function buildCssDefinition(el: HTMLElement, style: CSSStyleDeclaration): string {
    const className = elementClassName(el);
    let css =
        el.tagName.toLowerCase() +
        (el.id === '' ? '' : ' #' + el.id) +
        (className === '' ? '' : ' .' + className) +
        ' {\n';

    for (const category of CSS_CATEGORIES) {
        const props = propertiesFor(category.key);
        if (props.length === 0) continue;

        css += `\n\t/* ${category.title} */\n`;
        for (const property of props) {
            css += '\t' + property + ': ' + style.getPropertyValue(property) + ';\n';
        }
    }

    css += '}';
    return css;
}

/**
 * Owns overlay lifecycle: prefs, hover/key/highlight listeners, inspect state,
 * and panel positioning. Construct once per content-script boot.
 */
class OverlayController {
    // --- inspect / pointer ---
    private inspectedElement: HTMLElement | null = null;
    private lastPointer: Pointer | null = null;
    private pendingPanelPointer: { pageX: number; pageY: number } | null = null;
    private panelPositionFrame: number | null = null;

    // --- listener flags ---
    private haveHoverListeners = false;
    private haveKeyListeners = false;
    private trackingPointer = false;

    // --- prefs ---
    private panelFontSize = PANEL_FONT_SIZE_DEFAULT;
    private panelTheme: PanelTheme = 'light';
    private panelThemeUserSet = false;

    private flashMessageTimer: ReturnType<typeof setTimeout> | null = null;

    // Stable handler identities for add/removeEventListener.
    private readonly onPointerTrack = (e: MouseEvent): void => {
        this.lastPointer = {
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
        };
    };

    private readonly onMouseOver = (e: MouseEvent): void => {
        const el = eventTargetElement(e);
        if (!el || isInsidePanel(el)) return;
        this.inspectElement(el);
    };

    private readonly onMouseOut = (e: MouseEvent): void => {
        const el = eventTargetElement(e);
        if (!el || isInsidePanel(el)) return;

        if (el === this.inspectedElement) {
            this.inspectedElement = null;
            this.clearHighlight();
        }
    };

    private readonly onMouseMove = (e: MouseEvent): void => {
        const el = eventTargetElement(e);
        if (!el || isInsidePanel(el)) return;

        this.inspectElement(el);
        if (el === this.inspectedElement) this.highlightElement(el);
        this.schedulePanelPosition(e);
    };

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        this.handleKey(e);
    };

    private readonly onHighlightLayout = (): void => {
        this.syncHighlightToInspected();
    };

    /** Load font size + theme before the first enable(). */
    async loadPrefs(): Promise<void> {
        await Promise.all([this.loadPanelFontSize(), this.loadPanelTheme()]);
    }

    /**
     * Remember the pointer while dormant so enable() can inspect immediately.
     * Bound once for the content-script lifetime.
     */
    startPointerTracking(): void {
        if (this.trackingPointer) return;
        document.addEventListener('mousemove', this.onPointerTrack, POINTER_TRACK_OPTS);
        this.trackingPointer = true;
    }

    isEnabled(): boolean {
        return document.getElementById(OVERLAY_ID) !== null;
    }

    /** True while hover listeners are attached (false when frozen). */
    isTracking(): boolean {
        return this.haveHoverListeners;
    }

    enable(): boolean {
        if (document.getElementById(OVERLAY_ID)) return false;

        document.body.appendChild(this.createPanel());
        this.applyPanelFontSize();
        this.applyPanelTheme();
        this.addHoverListeners();
        this.addKeyListeners();
        this.addHighlightLayoutListeners();
        this.inspectElementUnderCursor();
        requestAnimationFrame(() => this.inspectElementUnderCursor());

        return true;
    }

    disable(): boolean {
        const block = document.getElementById(OVERLAY_ID);
        const message = document.getElementById(TOAST_ID);

        if (!block && !message) return false;

        if (block) {
            block.classList.remove(FROZEN_CLASS);
            document.body.removeChild(block);
        }
        if (message) document.body.removeChild(message);

        this.removeHoverListeners();
        this.removeKeyListeners();
        this.removeHighlightLayoutListeners();
        this.removeHighlight();
        this.inspectedElement = null;

        return true;
    }

    freeze(): boolean {
        const block = document.getElementById(OVERLAY_ID);
        if (!block || !this.haveHoverListeners) return false;

        this.removeHoverListeners();
        block.classList.add(FROZEN_CLASS);
        requestAnimationFrame(() => refreshSelectorOverflow());

        return true;
    }

    unfreeze(): boolean {
        const block = document.getElementById(OVERLAY_ID);
        if (!block || this.haveHoverListeners) return false;

        this.clearHighlight();
        this.inspectedElement = null;
        block.classList.remove(FROZEN_CLASS);
        collapseSelectorHeader();
        this.addHoverListeners();
        this.inspectElementUnderCursor();

        return true;
    }

    // --- prefs ---

    private async loadPanelFontSize(): Promise<void> {
        const stored = await chrome.storage.local.get(PANEL_FONT_SIZE_STORAGE_KEY);
        const value = stored[PANEL_FONT_SIZE_STORAGE_KEY];
        if (typeof value === 'number' && Number.isFinite(value)) {
            this.panelFontSize = clampPanelFontSize(Math.round(value));
        }
    }

    private async loadPanelTheme(): Promise<void> {
        const stored = await chrome.storage.local.get(PANEL_THEME_STORAGE_KEY);
        const value = stored[PANEL_THEME_STORAGE_KEY];
        if (value === 'dark' || value === 'light') {
            this.panelTheme = value;
            this.panelThemeUserSet = true;
            return;
        }

        this.panelTheme = systemPanelTheme();
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.panelThemeUserSet) return;
            this.panelTheme = systemPanelTheme();
            this.applyPanelTheme();
        });
    }

    private applyPanelFontSize(): void {
        const block = document.getElementById(OVERLAY_ID);
        if (!block) return;

        block.style.setProperty('--sd-font-size', `${this.panelFontSize}px`);
        keepPanelInViewport(block);
    }

    private applyPanelTheme(): void {
        const block = document.getElementById(OVERLAY_ID);
        if (block) {
            block.classList.toggle(DARK_CLASS, this.panelTheme === 'dark');
        }
    }

    private adjustPanelFontSize(delta: number): void {
        const next = clampPanelFontSize(this.panelFontSize + delta);
        if (next === this.panelFontSize) return;
        this.panelFontSize = next;
        this.applyPanelFontSize();
        void chrome.storage.local.set({ [PANEL_FONT_SIZE_STORAGE_KEY]: this.panelFontSize });
    }

    private resetPanelFontSize(): void {
        if (this.panelFontSize === PANEL_FONT_SIZE_DEFAULT) return;
        this.panelFontSize = PANEL_FONT_SIZE_DEFAULT;
        this.applyPanelFontSize();
        void chrome.storage.local.set({ [PANEL_FONT_SIZE_STORAGE_KEY]: this.panelFontSize });
    }

    private togglePanelTheme(): void {
        this.panelTheme = this.panelTheme === 'dark' ? 'light' : 'dark';
        this.panelThemeUserSet = true;
        this.applyPanelTheme();
        void chrome.storage.local.set({ [PANEL_THEME_STORAGE_KEY]: this.panelTheme });
    }

    // --- panel DOM ---

    private createPanel(): HTMLElement {
        const block = createBlock(document);
        this.flashMessage(
            'Style Detective loaded! Hover any element you want to inspect in the page.',
            { persistent: true },
        );
        return block;
    }

    private flashMessage(
        msg: string,
        options: { persistent?: boolean; tone?: 'default' | 'success' } = {},
    ): void {
        removeElement(TOAST_ID);
        if (this.flashMessageTimer) {
            clearTimeout(this.flashMessageTimer);
            this.flashMessageTimer = null;
        }

        const p = document.createElement('p');
        p.appendChild(document.createTextNode(msg));
        p.id = TOAST_ID;
        p.style.backgroundColor = options.tone === 'success' ? '#1f5c3a' : '#7a1f1f';
        p.style.color = '#ffffff';
        p.style.position = 'fixed';
        p.style.top = '10px';
        p.style.left = '10px';
        p.style.zIndex = '2147483647';
        p.style.padding = '8px 12px';
        p.style.borderRadius = '6px';
        p.style.fontFamily = 'Lucida sans, helvetica, sans-serif';
        p.style.fontSize = '12px';
        p.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
        p.style.pointerEvents = 'none';

        document.body.appendChild(p);

        if (!options.persistent) {
            this.flashMessageTimer = setTimeout(() => {
                removeElement(TOAST_ID);
                this.flashMessageTimer = null;
            }, 2000);
        }
    }

    // --- highlight ---

    private ensureHighlight(): HTMLElement {
        let box = document.getElementById(HIGHLIGHT_ID);
        if (!box) {
            box = document.createElement('div');
            box.id = HIGHLIGHT_ID;
            box.setAttribute('aria-hidden', 'true');
            document.body.appendChild(box);
        }
        return box;
    }

    private clearHighlight(): void {
        const box = document.getElementById(HIGHLIGHT_ID);
        if (box) box.style.display = 'none';
    }

    private removeHighlight(): void {
        removeElement(HIGHLIGHT_ID);
    }

    private highlightElement(el: HTMLElement): void {
        if (el.tagName === 'BODY' || el.tagName === 'HTML') {
            this.clearHighlight();
            return;
        }

        const box = this.ensureHighlight();
        const rect = el.getBoundingClientRect();
        box.style.display = 'block';
        box.style.top = `${rect.top}px`;
        box.style.left = `${rect.left}px`;
        box.style.width = `${Math.max(0, rect.width)}px`;
        box.style.height = `${Math.max(0, rect.height)}px`;
    }

    private syncHighlightToInspected(): void {
        if (this.inspectedElement?.isConnected) {
            this.highlightElement(this.inspectedElement);
        } else {
            this.clearHighlight();
        }
    }

    private addHighlightLayoutListeners(): void {
        window.addEventListener('scroll', this.onHighlightLayout, HIGHLIGHT_LAYOUT_OPTS);
        window.addEventListener('resize', this.onHighlightLayout, HIGHLIGHT_LAYOUT_OPTS);
    }

    private removeHighlightLayoutListeners(): void {
        window.removeEventListener('scroll', this.onHighlightLayout, HIGHLIGHT_LAYOUT_OPTS);
        window.removeEventListener('resize', this.onHighlightLayout, HIGHLIGHT_LAYOUT_OPTS);
    }

    // --- inspect / position ---

    private inspectElement(el: HTMLElement): void {
        if (isInsidePanel(el)) return;
        if (el === this.inspectedElement) return;

        const block = document.getElementById(OVERLAY_ID);
        if (!block) return;

        updateHeader(el);
        this.highlightElement(el);

        if (!document.defaultView) return;
        const style = document.defaultView.getComputedStyle(el, null);
        updatePanel(style, el);
        removeElement(TOAST_ID);

        this.inspectedElement = el;
    }

    private positionPanelAtPointer(e: { pageX: number; pageY: number }): void {
        const block = document.getElementById(OVERLAY_ID);
        if (!block) return;

        block.style.display = 'flex';

        const pageWidth = window.innerWidth;
        const BOTTOM_MARGIN = 40;
        const pageHeight = window.innerHeight - BOTTOM_MARGIN;
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

        if (!isElementInViewport(block)) block.style.top = window.pageYOffset + 20 + 'px';
    }

    private schedulePanelPosition(e: { pageX: number; pageY: number }): void {
        this.pendingPanelPointer = { pageX: e.pageX, pageY: e.pageY };
        if (this.panelPositionFrame !== null) return;

        this.panelPositionFrame = requestAnimationFrame(() => {
            this.panelPositionFrame = null;
            const pointer = this.pendingPanelPointer;
            this.pendingPanelPointer = null;
            if (pointer) this.positionPanelAtPointer(pointer);
        });
    }

    private cancelScheduledPanelPosition(): void {
        if (this.panelPositionFrame !== null) {
            cancelAnimationFrame(this.panelPositionFrame);
            this.panelPositionFrame = null;
        }
        this.pendingPanelPointer = null;
    }

    private inspectElementUnderCursor(): void {
        if (!this.lastPointer) return;

        const el = document.elementFromPoint(this.lastPointer.clientX, this.lastPointer.clientY);
        if (!el || !(el instanceof HTMLElement) || isInsidePanel(el)) return;

        this.inspectElement(el);
        this.positionPanelAtPointer(this.lastPointer);
    }

    // --- listeners ---

    private addHoverListeners(): void {
        if (this.haveHoverListeners) return;
        document.addEventListener('mouseover', this.onMouseOver, HOVER_LISTENER_OPTS);
        document.addEventListener('mouseout', this.onMouseOut, HOVER_LISTENER_OPTS);
        document.addEventListener('mousemove', this.onMouseMove, HOVER_LISTENER_OPTS);
        this.haveHoverListeners = true;
    }

    private removeHoverListeners(): void {
        if (!this.haveHoverListeners) return;
        document.removeEventListener('mouseover', this.onMouseOver, HOVER_LISTENER_OPTS);
        document.removeEventListener('mouseout', this.onMouseOut, HOVER_LISTENER_OPTS);
        document.removeEventListener('mousemove', this.onMouseMove, HOVER_LISTENER_OPTS);
        this.cancelScheduledPanelPosition();
        this.haveHoverListeners = false;
    }

    private addKeyListeners(): void {
        if (this.haveKeyListeners) return;
        document.addEventListener('keydown', this.onKeyDown);
        this.haveKeyListeners = true;
    }

    private removeKeyListeners(): void {
        if (!this.haveKeyListeners) return;
        document.removeEventListener('keydown', this.onKeyDown);
        this.haveKeyListeners = false;
    }

    private handleKey(e: KeyboardEvent): void {
        if (!this.isEnabled()) return;

        if (e.key === 'Escape') {
            this.disable();
            return;
        }

        if (e.altKey || e.ctrlKey || e.metaKey) return;

        const key = e.key.length === 1 ? e.key.toLowerCase() : '';
        if (key === 'f') {
            if (this.isTracking()) this.freeze();
            else this.unfreeze();
            return;
        }
        if (key === 'c') {
            e.preventDefault();
            void this.copyCssDefinition();
            return;
        }
        if (key === 'h') {
            e.preventDefault();
            void chrome.runtime.sendMessage({ type: 'openOptions' });
            return;
        }
        if (key === 'm') {
            e.preventDefault();
            this.togglePanelTheme();
            return;
        }

        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
            e.preventDefault();
            this.adjustPanelFontSize(PANEL_FONT_SIZE_STEP);
            return;
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
            e.preventDefault();
            this.adjustPanelFontSize(-PANEL_FONT_SIZE_STEP);
            return;
        }
        if (e.key === '0' || e.code === 'Numpad0') {
            e.preventDefault();
            this.resetPanelFontSize();
        }
    }

    private async copyCssDefinition(): Promise<void> {
        const el = this.inspectedElement;
        if (!el || !el.isConnected) {
            this.flashMessage('Nothing to copy — hover an element first.');
            return;
        }

        const view = document.defaultView;
        if (!view) {
            this.flashMessage('Could not copy to clipboard');
            return;
        }

        try {
            const css = buildCssDefinition(el, view.getComputedStyle(el, null));
            await copyTextToClipboard(css);
            this.flashMessage('CSS definition copied to clipboard', { tone: 'success' });
        } catch {
            this.flashMessage('Could not copy to clipboard');
        }
    }
}

// === Entry point ===

const controller = new OverlayController();
const ready = controller.loadPrefs();

const BOOT_FLAG = '__styleDetectiveBooted__';
const bootRoot = globalThis as typeof globalThis & { [BOOT_FLAG]?: boolean };

if (!bootRoot[BOOT_FLAG]) {
    bootRoot[BOOT_FLAG] = true;
    controller.startPointerTracking();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'toggleOverlay') return;

        void ready
            .then(() => {
                if (controller.isEnabled()) {
                    controller.disable();
                } else {
                    controller.enable();
                }
                sendResponse({ ok: true, enabled: controller.isEnabled() });
            })
            .catch((err: unknown) => {
                console.error('[Style Detective] toggle failed', err);
                sendResponse({ ok: false, error: String(err) });
            });

        return true;
    });
}
