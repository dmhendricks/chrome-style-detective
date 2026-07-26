/*!
 * Style Detective — content-script entry point.
 *
 * Declared in the manifest (all_frames) and loaded dormant on matching pages
 * and iframes. The service worker broadcasts a toggle; each frame owns its
 * OverlayController (prefs, listeners, highlight, inspect). This module only
 * boots that controller.
 */

import { copyTextToClipboard } from './lib/clipboard';
import { elementClassName, keepOverlayInViewport } from './lib/dom';
import {
    CSS_CATEGORIES,
    isPropertyEnabled,
    resolveProperty,
    type InspectContext,
} from './lib/properties';
import {
    createBlock,
    collapseSelectorHeader,
    refreshSelectorOverflow,
    setClassesCopyNotifier,
    setClassesExpanded,
    setHideCssClasses,
    updateClassesPanel,
    updateHeader,
    updatePanel,
} from './lib/panel';
import { formatClassesForCopy, parseClassTokens } from './lib/classes';
import {
    clampPanelFontSize,
    loadClassesExpanded,
    loadHideCssClasses,
    loadPanelFontSize,
    loadPanelThemePreference,
    parseClassesExpanded,
    parseHideCssClasses,
    parsePanelFontSize,
    parsePanelTheme,
    resolvePanelTheme,
    savePanelFontSize,
    type PanelThemePreference,
    CLASSES_EXPANDED_KEY,
    HIDE_CSS_CLASSES_KEY,
    PANEL_FONT_SIZE_DEFAULT,
    PANEL_FONT_SIZE_KEY,
    PANEL_FONT_SIZE_STEP,
    PANEL_THEME_KEY,
} from '../shared/prefs';
import './style.scss';

const FROZEN_CLASS = 'StyleDetectiveOverlay--frozen';
const DARK_CLASS = 'StyleDetectiveOverlay--dark';
const HIGHLIGHT_ID = 'StyleDetectiveHighlight';
const OVERLAY_ID = 'StyleDetectiveOverlay';
const TOAST_ID = 'StyleDetectiveToast';
const TOAST_SUCCESS_CLASS = 'StyleDetectiveToast--success';

type Pointer = { clientX: number; clientY: number; pageX: number; pageY: number };

const HOVER_LISTENER_OPTS: AddEventListenerOptions = { capture: true, passive: true };
const HIGHLIGHT_LAYOUT_OPTS: AddEventListenerOptions = { capture: true, passive: true };

function systemPrefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
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

function removeElement(id: string): void {
    const n = document.getElementById(id);
    if (n) n.remove();
}

/**
 * Build a CSS definition for copy. Only includes properties that would appear
 * in the panel (same `when` / `hideDefault` visibility), omits `panelOnly`
 * rows, and skips tag-gated categories that don't match the element.
 */
function buildCssDefinition(el: HTMLElement, style: CSSStyleDeclaration): string {
    const className = elementClassName(el);
    let css =
        el.tagName.toLowerCase() +
        (el.id === '' ? '' : ' #' + el.id) +
        (className === '' ? '' : ' .' + className) +
        ' {\n';

    const ctx: InspectContext = {
        style,
        el,
        get: (property) => style.getPropertyValue(property),
    };

    for (const category of CSS_CATEGORIES) {
        if (category.tags && !category.tags.includes(el.tagName)) continue;

        let categoryCss = '';
        for (const property of category.properties) {
            if (!isPropertyEnabled(property) || property.panelOnly) continue;

            const resolved = resolveProperty(property, ctx);
            if (!resolved.visible) continue;

            // Prefer synthesized values (margin/padding/border shorthands, etc.).
            // Skip panel `format` helpers — they can be display-only (e.g. filename).
            const value = property.value ? resolved.value : ctx.get(property.name);
            categoryCss += '\t' + property.name + ': ' + value + ';\n';
        }

        if (categoryCss === '') continue;
        css += `\n\t/* ${category.title} */\n` + categoryCss;
    }

    css += '}';
    return css;
}

/**
 * Owns overlay lifecycle: prefs, hover/key/highlight listeners, inspect state,
 * and panel positioning. Construct once per content-script boot.
 */
class OverlayController {
    /** Distinguishes this frame's controller when broadcasting overlay claims. */
    private readonly instanceId = crypto.randomUUID();

    /** Tab-wide arm state (synced via the service worker). */
    private armed = false;

    // --- inspect / pointer ---
    private inspectedElement: HTMLElement | null = null;
    private lastPointer: Pointer | null = null;
    /** False after the cursor leaves this frame (e.g. into an iframe). */
    private pointerInFrame = false;
    private pendingPanelPointer: { pageX: number; pageY: number } | null = null;
    private panelPositionFrame: number | null = null;
    private claimFrame: number | null = null;

    // --- listener flags ---
    private haveHoverListeners = false;
    private haveKeyListeners = false;

    // --- prefs ---
    private panelFontSize = PANEL_FONT_SIZE_DEFAULT;
    private panelThemePreference: PanelThemePreference = 'system';
    private systemThemeMedia: MediaQueryList | null = null;

    private flashMessageTimer: ReturnType<typeof setTimeout> | null = null;

    // Stable handler identities for add/removeEventListener.
    private readonly onPointerLeaveFrame = (): void => {
        // Entering a child browsing context (iframe) leaves this document —
        // drop the stale point so we don't steal the claim from the frame
        // that actually has the cursor.
        this.pointerInFrame = false;
        this.lastPointer = null;
    };

    private readonly onMouseOver = (e: MouseEvent): void => {
        this.notePointer(e);
        const el = eventTargetElement(e);
        if (!el || isInsidePanel(el)) return;
        this.inspectElement(el);
    };

    private readonly onMouseOut = (e: MouseEvent): void => {
        const el = eventTargetElement(e);
        if (!el || isInsidePanel(el)) return;

        // mouseout fires when entering a descendant — that is not a leave.
        const next = e.relatedTarget;
        if (next instanceof Node && el.contains(next)) return;

        if (el === this.inspectedElement) {
            this.inspectedElement = null;
            this.clearHighlight();
        }
    };

    private readonly onMouseMove = (e: MouseEvent): void => {
        this.notePointer(e);
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

    /** Load font size, theme, and feature prefs before the first enable(). */
    async loadPrefs(): Promise<void> {
        setClassesCopyNotifier((message, tone) => {
            this.flashMessage(message, { tone: tone ?? 'default' });
        });
        await Promise.all([
            this.loadPanelFontSizePref(),
            this.loadPanelThemePref(),
            this.loadHideCssClassesPref(),
            this.loadClassesExpandedPref(),
        ]);
        this.watchPrefs();
    }

    isEnabled(): boolean {
        return this.armed;
    }

    /** True while hover listeners are attached (false when frozen). */
    isTracking(): boolean {
        return this.haveHoverListeners;
    }

    /** Apply the tab-wide armed flag from the service worker. */
    setArmed(armed: boolean): void {
        if (armed) this.enable();
        else this.disable();
    }

    /**
     * Another frame claimed the visible pane — hide ours but stay armed so
     * the next hover here can take over again.
     */
    onOverlayClaim(instanceId: string): void {
        if (instanceId === this.instanceId) return;
        this.park();
    }

    enable(): boolean {
        if (this.armed) return false;

        this.armed = true;
        this.addHoverListeners();
        this.addKeyListeners();
        this.addHighlightLayoutListeners();
        // Panel opens on the next hover/move in this frame (no dormant
        // mousemove tracker — see notePointer). Cue engagement immediately.
        if (window === window.top) {
            this.flashMessage(
                'Style Detective loaded! Hover any element you want to inspect in the page.',
                { persistent: true },
            );
        }

        return true;
    }

    disable(): boolean {
        const wasArmed = this.armed;
        const block = document.getElementById(OVERLAY_ID);
        const message = document.getElementById(TOAST_ID);

        this.armed = false;

        if (!wasArmed && !block && !message) return false;

        if (block) {
            block.classList.remove(FROZEN_CLASS);
            block.remove();
        }
        if (message) message.remove();

        this.removeHoverListeners();
        this.removeKeyListeners();
        this.removeHighlightLayoutListeners();
        this.removeHighlight();
        this.inspectedElement = null;
        this.pointerInFrame = false;
        this.lastPointer = null;
        this.cancelScheduledPanelPosition();
        if (this.claimFrame !== null) {
            cancelAnimationFrame(this.claimFrame);
            this.claimFrame = null;
        }

        return true;
    }

    freeze(): boolean {
        const block = document.getElementById(OVERLAY_ID);
        if (!this.armed || !block || !this.haveHoverListeners) return false;

        this.removeHoverListeners();
        block.classList.add(FROZEN_CLASS);
        requestAnimationFrame(() => refreshSelectorOverflow());

        return true;
    }

    unfreeze(): boolean {
        const block = document.getElementById(OVERLAY_ID);
        if (!this.armed || !block || this.haveHoverListeners) return false;

        this.clearHighlight();
        this.inspectedElement = null;
        block.classList.remove(FROZEN_CLASS);
        collapseSelectorHeader();
        this.addHoverListeners();
        this.inspectElementUnderCursor();

        return true;
    }

    // --- prefs ---

    private async loadPanelFontSizePref(): Promise<void> {
        this.panelFontSize = await loadPanelFontSize();
    }

    private async loadPanelThemePref(): Promise<void> {
        this.panelThemePreference = await loadPanelThemePreference();
        this.bindSystemThemeListener();
    }

    private async loadHideCssClassesPref(): Promise<void> {
        setHideCssClasses(await loadHideCssClasses());
    }

    private async loadClassesExpandedPref(): Promise<void> {
        setClassesExpanded(await loadClassesExpanded());
    }

    private watchPrefs(): void {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;

            const themeChange = changes[PANEL_THEME_KEY];
            if (themeChange) {
                this.panelThemePreference = parsePanelTheme(themeChange.newValue);
                this.bindSystemThemeListener();
                this.applyPanelTheme();
            }

            const hideClassesChange = changes[HIDE_CSS_CLASSES_KEY];
            if (hideClassesChange) {
                setHideCssClasses(parseHideCssClasses(hideClassesChange.newValue));
                if (this.inspectedElement?.isConnected) {
                    updateClassesPanel(this.inspectedElement);
                }
            }

            const classesExpandedChange = changes[CLASSES_EXPANDED_KEY];
            if (classesExpandedChange) {
                setClassesExpanded(parseClassesExpanded(classesExpandedChange.newValue));
            }

            const fontSizeChange = changes[PANEL_FONT_SIZE_KEY];
            if (fontSizeChange) {
                const next = parsePanelFontSize(fontSizeChange.newValue);
                if (next !== this.panelFontSize) {
                    this.panelFontSize = next;
                    this.applyPanelFontSize();
                }
            }
        });
    }

    private bindSystemThemeListener(): void {
        if (!this.systemThemeMedia) {
            this.systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
            this.systemThemeMedia.addEventListener('change', () => {
                if (this.panelThemePreference !== 'system') return;
                this.applyPanelTheme();
            });
        }
    }

    private appliedPanelTheme(): 'light' | 'dark' {
        return resolvePanelTheme(this.panelThemePreference, systemPrefersDark());
    }

    private applyPanelFontSize(): void {
        const block = document.getElementById(OVERLAY_ID);
        if (!block) return;

        block.style.setProperty('--sd-font-size', `${this.panelFontSize}px`);
        keepOverlayInViewport(block);
    }

    private applyPanelTheme(): void {
        const block = document.getElementById(OVERLAY_ID);
        if (block) {
            block.classList.toggle(DARK_CLASS, this.appliedPanelTheme() === 'dark');
        }
    }

    private adjustPanelFontSize(delta: number): void {
        const next = clampPanelFontSize(this.panelFontSize + delta);
        if (next === this.panelFontSize) return;
        this.panelFontSize = next;
        this.applyPanelFontSize();
        void savePanelFontSize(this.panelFontSize);
    }

    private resetPanelFontSize(): void {
        if (this.panelFontSize === PANEL_FONT_SIZE_DEFAULT) return;
        this.panelFontSize = PANEL_FONT_SIZE_DEFAULT;
        this.applyPanelFontSize();
        void savePanelFontSize(this.panelFontSize);
    }

    // --- panel DOM ---

    /** Create the panel on first use in this frame. */
    private ensurePanel(): HTMLElement {
        let block = document.getElementById(OVERLAY_ID);
        if (!block) {
            block = createBlock(document);
            document.body.append(block);
            this.applyPanelFontSize();
            this.applyPanelTheme();
        }
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
        p.id = TOAST_ID;
        if (options.tone === 'success') p.className = TOAST_SUCCESS_CLASS;
        p.append(document.createTextNode(msg));
        document.body.append(p);

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
            document.body.append(box);
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

    private notePointer(e: MouseEvent): void {
        this.pointerInFrame = true;
        this.lastPointer = {
            clientX: e.clientX,
            clientY: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
        };
    }

    /** Tell sibling frames to hide their pane; coalesce to one message per frame. */
    private claimOverlay(): void {
        if (this.claimFrame !== null) return;

        this.claimFrame = requestAnimationFrame(() => {
            this.claimFrame = null;
            void chrome.runtime
                .sendMessage({ type: 'overlayClaim', instanceId: this.instanceId })
                .catch(() => {
                    // Service worker may be asleep mid-navigation.
                });
        });
    }

    /**
     * Hide the panel and highlight without disabling this frame. Restores hover
     * tracking if we were frozen so a later hover can reclaim the pane.
     */
    private park(): void {
        const block = document.getElementById(OVERLAY_ID);
        if (!block && !this.inspectedElement) return;

        if (block) {
            const wasFrozen = block.classList.contains(FROZEN_CLASS);
            block.classList.remove(FROZEN_CLASS);
            block.style.display = 'none';
            if (wasFrozen && !this.haveHoverListeners) {
                collapseSelectorHeader();
                this.addHoverListeners();
            }
        }

        this.clearHighlight();
        this.inspectedElement = null;
        this.cancelScheduledPanelPosition();
        if (this.claimFrame !== null) {
            cancelAnimationFrame(this.claimFrame);
            this.claimFrame = null;
        }
        // Another frame has the cursor — don't keep a point that could re-claim.
        this.pointerInFrame = false;
        this.lastPointer = null;
    }

    private inspectElement(el: HTMLElement): void {
        if (!this.armed || isInsidePanel(el)) return;

        // Same target: still refresh computed styles so :hover / class toggles
        // (e.g. hover-primary) don't leave the panel on stale colors.
        if (el === this.inspectedElement) {
            this.refreshInspectedStyles();
            return;
        }

        this.ensurePanel();
        this.claimOverlay();
        updateHeader(el);
        updateClassesPanel(el);
        this.highlightElement(el);

        if (!document.defaultView) return;
        const style = document.defaultView.getComputedStyle(el, null);
        updatePanel(style, el);
        removeElement(TOAST_ID);

        this.inspectedElement = el;
    }

    /** Re-read computed style for the current target without rebuilding chrome. */
    private refreshInspectedStyles(): void {
        const el = this.inspectedElement;
        if (!el?.isConnected || !document.defaultView) return;
        updatePanel(document.defaultView.getComputedStyle(el, null), el);
    }

    private positionPanelAtPointer(e: { pageX: number; pageY: number }): void {
        if (!this.armed) return;

        const block = this.ensurePanel();
        this.claimOverlay();
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
        if (!this.pointerInFrame || !this.lastPointer) return;

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
        document.documentElement.addEventListener(
            'mouseleave',
            this.onPointerLeaveFrame,
            HOVER_LISTENER_OPTS,
        );
        this.haveHoverListeners = true;
    }

    private removeHoverListeners(): void {
        if (!this.haveHoverListeners) return;
        document.removeEventListener('mouseover', this.onMouseOver, HOVER_LISTENER_OPTS);
        document.removeEventListener('mouseout', this.onMouseOut, HOVER_LISTENER_OPTS);
        document.removeEventListener('mousemove', this.onMouseMove, HOVER_LISTENER_OPTS);
        document.documentElement.removeEventListener(
            'mouseleave',
            this.onPointerLeaveFrame,
            HOVER_LISTENER_OPTS,
        );
        this.cancelScheduledPanelPosition();
        this.haveHoverListeners = false;
    }

    private addKeyListeners(): void {
        if (this.haveKeyListeners) return;
        // Capture so Esc still reaches us before page handlers when possible.
        document.addEventListener('keydown', this.onKeyDown, true);
        this.haveKeyListeners = true;
    }

    private removeKeyListeners(): void {
        if (!this.haveKeyListeners) return;
        document.removeEventListener('keydown', this.onKeyDown, true);
        this.haveKeyListeners = false;
    }

    private handleKey(e: KeyboardEvent): void {
        if (!this.armed) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            // Disarm every frame in the tab — local disable only closes this frame.
            void chrome.runtime.sendMessage({ type: 'disarmOverlay' }).catch(() => {
                this.disable();
            });
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
            if (e.shiftKey) void this.copyElementClasses();
            else void this.copyCssDefinition();
            return;
        }
        if (key === 's') {
            e.preventDefault();
            void chrome.runtime.sendMessage({ type: 'openOptions' });
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

    private async copyElementClasses(): Promise<void> {
        const el = this.inspectedElement;
        if (!el || !el.isConnected) {
            this.flashMessage('Nothing to copy — hover an element first.');
            return;
        }

        const tokens = parseClassTokens(el);
        if (tokens.length === 0) {
            this.flashMessage('No classes on this element.');
            return;
        }

        try {
            await copyTextToClipboard(formatClassesForCopy(tokens));
            this.flashMessage('Classes copied to clipboard', { tone: 'success' });
        } catch {
            this.flashMessage('Could not copy to clipboard');
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'pingOverlay') {
            sendResponse({ ok: true });
            return;
        }

        if (message?.type === 'overlayClaim' && typeof message.instanceId === 'string') {
            controller.onOverlayClaim(message.instanceId);
            return;
        }

        if (message?.type === 'setOverlayArmed' && typeof message.armed === 'boolean') {
            void ready
                .then(() => {
                    controller.setArmed(message.armed);
                    sendResponse({ ok: true, enabled: controller.isEnabled() });
                })
                .catch((err: unknown) => {
                    console.error('[Style Detective] setArmed failed', err);
                    sendResponse({ ok: false, error: String(err) });
                });
            return true;
        }
    });
}
