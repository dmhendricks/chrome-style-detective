/*!
 * Style Detective — options page script.
 *
 * Loads and persists preferences from chrome.storage.local. Keep UI logic
 * small; share keys with the content script via ../shared/prefs.
 */

import {
    loadClassesChipLines,
    loadPanelThemePreference,
    loadShowBoxModel,
    loadShowCssClasses,
    parseClassesChipLines,
    parsePanelTheme,
    parseShowBoxModel,
    parseShowCssClasses,
    saveClassesChipLines,
    savePanelThemePreference,
    saveShowBoxModel,
    saveShowCssClasses,
    type PanelThemePreference,
    CLASSES_CHIP_LINES_KEY,
    CLASSES_CHIP_LINES_MAX,
    CLASSES_CHIP_LINES_MIN,
    PANEL_THEME_KEY,
    SHOW_BOX_MODEL_KEY,
    SHOW_CSS_CLASSES_KEY,
} from '../shared/prefs';
import { Messages } from '../shared/messages';

const showCssClassesToggle = document.querySelector<HTMLInputElement>('#showCssClasses');
const showBoxModelToggle = document.querySelector<HTMLInputElement>('#showBoxModelDiagram');
const classesChipLinesInput = document.querySelector<HTMLInputElement>('#classesChipLines');
const classesChipLinesRow = document.querySelector<HTMLElement>('#classesChipLines-row');
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="panelTheme"]');
const storeRateLink = document.querySelector<HTMLAnchorElement>('#storeRateLink');

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

async function syncShowCssClassesFromStorage(): Promise<void> {
    if (!showCssClassesToggle) return;
    const shown = await loadShowCssClasses();
    showCssClassesToggle.checked = shown;
    syncChipLinesRowVisibility(shown);
}

function wireShowCssClassesToggle(): void {
    if (!showCssClassesToggle) return;

    showCssClassesToggle.addEventListener('change', () => {
        const shown = showCssClassesToggle.checked;
        syncChipLinesRowVisibility(shown);
        void saveShowCssClasses(shown);
    });
}

async function syncShowBoxModelFromStorage(): Promise<void> {
    if (!showBoxModelToggle) return;
    showBoxModelToggle.checked = await loadShowBoxModel();
}

function wireShowBoxModelToggle(): void {
    if (!showBoxModelToggle) return;

    showBoxModelToggle.addEventListener('change', () => {
        void saveShowBoxModel(showBoxModelToggle.checked);
    });
}

function commitClassesChipLines(): void {
    if (!classesChipLinesInput) return;
    const next = parseClassesChipLines(Number(classesChipLinesInput.value));
    classesChipLinesInput.value = String(next);
    void saveClassesChipLines(next);
}

async function syncClassesChipLinesFromStorage(): Promise<void> {
    if (!classesChipLinesInput) return;
    classesChipLinesInput.value = String(await loadClassesChipLines());
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

function setThemeRadios(theme: PanelThemePreference): void {
    for (const radio of themeRadios) {
        radio.checked = radio.value === theme;
    }
}

async function syncThemeFromStorage(): Promise<void> {
    setThemeRadios(await loadPanelThemePreference());
}

function wireThemeRadios(): void {
    for (const radio of themeRadios) {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            void savePanelThemePreference(parsePanelTheme(radio.value));
        });
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const showClassesChange = changes[SHOW_CSS_CLASSES_KEY];
    if (showClassesChange && showCssClassesToggle) {
        const shown = parseShowCssClasses(showClassesChange.newValue);
        showCssClassesToggle.checked = shown;
        syncChipLinesRowVisibility(shown);
    }

    const showBoxModelChange = changes[SHOW_BOX_MODEL_KEY];
    if (showBoxModelChange && showBoxModelToggle) {
        showBoxModelToggle.checked = parseShowBoxModel(showBoxModelChange.newValue);
    }

    const chipLinesChange = changes[CLASSES_CHIP_LINES_KEY];
    if (chipLinesChange && classesChipLinesInput) {
        classesChipLinesInput.value = String(parseClassesChipLines(chipLinesChange.newValue));
    }

    const themeChange = changes[PANEL_THEME_KEY];
    if (themeChange) {
        setThemeRadios(parsePanelTheme(themeChange.newValue));
    }
});

void syncShowCssClassesFromStorage();
wireShowCssClassesToggle();
void syncShowBoxModelFromStorage();
wireShowBoxModelToggle();
void syncClassesChipLinesFromStorage();
wireClassesChipLinesInput();
void syncThemeFromStorage();
wireThemeRadios();
wireStoreRateLink();
void registerRestrictedOptionsTab();
