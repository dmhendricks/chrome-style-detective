/*!
 * Style Detective — options page script.
 *
 * Loads and persists preferences from chrome.storage.local. Keep UI logic
 * small; share keys with the content script via ../shared/prefs.
 */

import {
    loadClassesChipLines,
    loadPanelFontSize,
    loadPanelThemePreference,
    loadShowBoxModel,
    loadShowCssClasses,
    parseClassesChipLines,
    parsePanelFontSize,
    parsePanelTheme,
    parseShowBoxModel,
    parseShowCssClasses,
    saveClassesChipLines,
    savePanelFontSize,
    savePanelThemePreference,
    saveShowBoxModel,
    saveShowCssClasses,
    type PanelThemePreference,
    CLASSES_CHIP_LINES_DEFAULT,
    CLASSES_CHIP_LINES_KEY,
    CLASSES_CHIP_LINES_MAX,
    CLASSES_CHIP_LINES_MIN,
    PANEL_FONT_SIZE_DEFAULT,
    PANEL_FONT_SIZE_KEY,
    PANEL_FONT_SIZE_MAX,
    PANEL_FONT_SIZE_MIN,
    PANEL_THEME_DEFAULT,
    PANEL_THEME_KEY,
    SHOW_BOX_MODEL_DEFAULT,
    SHOW_BOX_MODEL_KEY,
    SHOW_CSS_CLASSES_DEFAULT,
    SHOW_CSS_CLASSES_KEY,
} from '../shared/prefs';
import { Messages } from '../shared/messages';
import { mountPreview, renderPreview, type PreviewState } from './preview';

type TabId = 'guide' | 'settings';

const showCssClassesToggle = document.querySelector<HTMLInputElement>('#showCssClasses');
const showBoxModelToggle = document.querySelector<HTMLInputElement>('#showBoxModelDiagram');
const classesChipLinesInput = document.querySelector<HTMLInputElement>('#classesChipLines');
const classesChipLinesRow = document.querySelector<HTMLElement>('#classesChipLines-row');
const panelFontSizeInput = document.querySelector<HTMLInputElement>('#panelFontSize');
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="panelTheme"]');
const resetDefaultsBtn = document.querySelector<HTMLButtonElement>('#resetDefaults');
const storeRateLink = document.querySelector<HTMLAnchorElement>('#storeRateLink');
const previewMount = document.querySelector<HTMLElement>('#previewMount');
const tabButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('.tab[data-tab]'),
];
const tabPanels = [
    ...document.querySelectorAll<HTMLElement>('[data-tab-panel]'),
];

let previewState: PreviewState = {
    theme: PANEL_THEME_DEFAULT,
    showCssClasses: SHOW_CSS_CLASSES_DEFAULT,
    classesChipLines: CLASSES_CHIP_LINES_DEFAULT,
    showBoxModel: SHOW_BOX_MODEL_DEFAULT,
    panelFontSize: PANEL_FONT_SIZE_DEFAULT,
};

function refreshPreview(): void {
    renderPreview(previewState);
}

/** Listing URL from the installed extension id (stable after store publish). */
function wireStoreRateLink(): void {
    if (!storeRateLink) return;
    storeRateLink.href =
        'https://chromewebstore.google.com/detail/style-detective/fbfplfafboelbaogjidoamdjjcckemib';
}

/**
 * Toolbar can't inject into this page — register so the action shows unsupported.html.
 * chrome.tabs often omits chrome-extension:// URLs without the `tabs` permission.
 */
async function registerRestrictedOptionsTab(): Promise<void> {
    try {
        const tab = await chrome.tabs.getCurrent();
        await chrome.runtime.sendMessage(
            Messages.registerRestrictedTab({
                tabId: tab?.id,
                url: tab?.url ?? chrome.runtime.getURL('src/options/options.html'),
            }),
        );
    } catch {
        // Service worker may be waking; click path still shows unsupported.
    }
}

function syncChipLinesRowVisibility(showClasses: boolean): void {
    if (!classesChipLinesRow) return;
    classesChipLinesRow.hidden = !showClasses;
}

function parseTabHash(): TabId {
    const hash = location.hash.replace(/^#/, '');
    return hash === 'settings' ? 'settings' : 'guide';
}

function isUpdateHighlight(): boolean {
    return new URLSearchParams(location.search).get('update') === 'true';
}

function applyUpdateHighlights(): void {
    const boxModelNew = document.querySelector<HTMLElement>('#showBoxModelDiagram-new');
    if (boxModelNew) boxModelNew.hidden = !isUpdateHighlight();
}

function setActiveTab(tab: TabId, pushHash: boolean): void {
    for (const btn of tabButtons) {
        const selected = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        btn.tabIndex = selected ? 0 : -1;
    }
    for (const panel of tabPanels) {
        const match = panel.dataset.tabPanel === tab;
        panel.hidden = !match;
    }
    if (pushHash) {
        // Keep `?update=true` (and any other search) when switching tabs.
        const next = new URL(location.href);
        next.hash = tab;
        if (location.href !== next.href) {
            history.replaceState(null, '', next);
        }
    }
}

function wireTabs(): void {
    const tablist = document.querySelector('.tablist');
    if (!tablist || tabButtons.length === 0) return;

    for (const btn of tabButtons) {
        btn.addEventListener('click', () => {
            const tab = (btn.dataset.tab === 'settings' ? 'settings' : 'guide') as TabId;
            setActiveTab(tab, true);
        });
    }

    tablist.addEventListener('keydown', (e: Event) => {
        if (!(e instanceof KeyboardEvent)) return;
        if (!(e.target instanceof HTMLElement)) return;
        const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(e.key)) return;

        e.preventDefault();
        const order = tabButtons;
        const current = order.findIndex((b) => b.getAttribute('aria-selected') === 'true');
        let next = current;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            next = (current + 1) % order.length;
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            next = (current - 1 + order.length) % order.length;
        } else if (e.key === 'Home') {
            next = 0;
        } else if (e.key === 'End') {
            next = order.length - 1;
        }
        const btn = order[next];
        if (!btn) return;
        btn.focus();
        const tab = (btn.dataset.tab === 'settings' ? 'settings' : 'guide') as TabId;
        setActiveTab(tab, true);
    });

    window.addEventListener('hashchange', () => {
        setActiveTab(parseTabHash(), false);
    });

    setActiveTab(parseTabHash(), true);
    applyUpdateHighlights();
}

async function syncShowCssClassesFromStorage(): Promise<void> {
    if (!showCssClassesToggle) return;
    const shown = await loadShowCssClasses();
    showCssClassesToggle.checked = shown;
    syncChipLinesRowVisibility(shown);
    previewState = { ...previewState, showCssClasses: shown };
}

function wireShowCssClassesToggle(): void {
    if (!showCssClassesToggle) return;

    showCssClassesToggle.addEventListener('change', () => {
        const shown = showCssClassesToggle.checked;
        syncChipLinesRowVisibility(shown);
        previewState = { ...previewState, showCssClasses: shown };
        refreshPreview();
        void saveShowCssClasses(shown);
    });
}

async function syncShowBoxModelFromStorage(): Promise<void> {
    if (!showBoxModelToggle) return;
    const shown = await loadShowBoxModel();
    showBoxModelToggle.checked = shown;
    previewState = { ...previewState, showBoxModel: shown };
}

function wireShowBoxModelToggle(): void {
    if (!showBoxModelToggle) return;

    showBoxModelToggle.addEventListener('change', () => {
        const shown = showBoxModelToggle.checked;
        previewState = { ...previewState, showBoxModel: shown };
        refreshPreview();
        void saveShowBoxModel(shown);
    });
}

function commitClassesChipLines(): void {
    if (!classesChipLinesInput) return;
    const next = parseClassesChipLines(Number(classesChipLinesInput.value));
    classesChipLinesInput.value = String(next);
    previewState = { ...previewState, classesChipLines: next };
    refreshPreview();
    void saveClassesChipLines(next);
}

async function syncClassesChipLinesFromStorage(): Promise<void> {
    if (!classesChipLinesInput) return;
    const lines = await loadClassesChipLines();
    classesChipLinesInput.value = String(lines);
    previewState = { ...previewState, classesChipLines: lines };
}

function wireClassesChipLinesInput(): void {
    if (!classesChipLinesInput) return;

    classesChipLinesInput.min = String(CLASSES_CHIP_LINES_MIN);
    classesChipLinesInput.max = String(CLASSES_CHIP_LINES_MAX);

    classesChipLinesInput.addEventListener('change', () => {
        commitClassesChipLines();
    });

    classesChipLinesInput.addEventListener('blur', () => {
        commitClassesChipLines();
    });
}

function commitPanelFontSize(): void {
    if (!panelFontSizeInput) return;
    const next = parsePanelFontSize(Number(panelFontSizeInput.value));
    panelFontSizeInput.value = String(next);
    previewState = { ...previewState, panelFontSize: next };
    refreshPreview();
    void savePanelFontSize(next);
}

async function syncPanelFontSizeFromStorage(): Promise<void> {
    if (!panelFontSizeInput) return;
    const size = await loadPanelFontSize();
    panelFontSizeInput.value = String(size);
    previewState = { ...previewState, panelFontSize: size };
}

function wirePanelFontSizeInput(): void {
    if (!panelFontSizeInput) return;

    panelFontSizeInput.min = String(PANEL_FONT_SIZE_MIN);
    panelFontSizeInput.max = String(PANEL_FONT_SIZE_MAX);

    panelFontSizeInput.addEventListener('change', () => {
        commitPanelFontSize();
    });

    panelFontSizeInput.addEventListener('blur', () => {
        commitPanelFontSize();
    });
}

function setThemeRadios(theme: PanelThemePreference): void {
    for (const radio of themeRadios) {
        radio.checked = radio.value === theme;
    }
}

async function syncThemeFromStorage(): Promise<void> {
    const theme = await loadPanelThemePreference();
    setThemeRadios(theme);
    previewState = { ...previewState, theme };
}

function wireThemeRadios(): void {
    for (const radio of themeRadios) {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            const theme = parsePanelTheme(radio.value);
            previewState = { ...previewState, theme };
            refreshPreview();
            void savePanelThemePreference(theme);
        });
    }
}

function wireResetDefaults(): void {
    if (!resetDefaultsBtn) return;

    resetDefaultsBtn.addEventListener('click', () => {
        previewState = {
            theme: PANEL_THEME_DEFAULT,
            showCssClasses: SHOW_CSS_CLASSES_DEFAULT,
            classesChipLines: CLASSES_CHIP_LINES_DEFAULT,
            showBoxModel: SHOW_BOX_MODEL_DEFAULT,
            panelFontSize: PANEL_FONT_SIZE_DEFAULT,
        };

        setThemeRadios(previewState.theme);
        if (showCssClassesToggle) showCssClassesToggle.checked = previewState.showCssClasses;
        if (showBoxModelToggle) showBoxModelToggle.checked = previewState.showBoxModel;
        if (classesChipLinesInput) {
            classesChipLinesInput.value = String(previewState.classesChipLines);
        }
        if (panelFontSizeInput) {
            panelFontSizeInput.value = String(previewState.panelFontSize);
        }
        syncChipLinesRowVisibility(previewState.showCssClasses);
        refreshPreview();

        void savePanelThemePreference(previewState.theme);
        void saveShowCssClasses(previewState.showCssClasses);
        void saveShowBoxModel(previewState.showBoxModel);
        void saveClassesChipLines(previewState.classesChipLines);
        void savePanelFontSize(previewState.panelFontSize);
    });
}

try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area !== 'local') return;

        const showClassesChange = changes[SHOW_CSS_CLASSES_KEY];
        if (showClassesChange && showCssClassesToggle) {
            const shown = parseShowCssClasses(showClassesChange.newValue);
            showCssClassesToggle.checked = shown;
            syncChipLinesRowVisibility(shown);
            previewState = { ...previewState, showCssClasses: shown };
            refreshPreview();
        }

        const showBoxModelChange = changes[SHOW_BOX_MODEL_KEY];
        if (showBoxModelChange && showBoxModelToggle) {
            const shown = parseShowBoxModel(showBoxModelChange.newValue);
            showBoxModelToggle.checked = shown;
            previewState = { ...previewState, showBoxModel: shown };
            refreshPreview();
        }

        const chipLinesChange = changes[CLASSES_CHIP_LINES_KEY];
        if (chipLinesChange && classesChipLinesInput) {
            const lines = parseClassesChipLines(chipLinesChange.newValue);
            classesChipLinesInput.value = String(lines);
            previewState = { ...previewState, classesChipLines: lines };
            refreshPreview();
        }

        const fontSizeChange = changes[PANEL_FONT_SIZE_KEY];
        if (fontSizeChange && panelFontSizeInput) {
            const size = parsePanelFontSize(fontSizeChange.newValue);
            panelFontSizeInput.value = String(size);
            previewState = { ...previewState, panelFontSize: size };
            refreshPreview();
        }

        const themeChange = changes[PANEL_THEME_KEY];
        if (themeChange) {
            const theme = parsePanelTheme(themeChange.newValue);
            setThemeRadios(theme);
            previewState = { ...previewState, theme };
            refreshPreview();
        }
    });
} catch {
    // Options can be previewed outside an extension context (no chrome.storage).
}

wireTabs();

if (previewMount) {
    mountPreview(previewMount);
}

void (async () => {
    await Promise.all([
        syncShowCssClassesFromStorage(),
        syncShowBoxModelFromStorage(),
        syncClassesChipLinesFromStorage(),
        syncPanelFontSizeFromStorage(),
        syncThemeFromStorage(),
    ]);
    refreshPreview();
})();

wireShowCssClassesToggle();
wireShowBoxModelToggle();
wireClassesChipLinesInput();
wirePanelFontSizeInput();
wireThemeRadios();
wireResetDefaults();
wireStoreRateLink();
void registerRestrictedOptionsTab();
