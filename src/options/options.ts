/*!
 * Style Detective — options page script.
 *
 * Loads and persists preferences from chrome.storage.local. Keep UI logic
 * small; share keys with the content script via ../shared/prefs.
 */

import {
    loadHideCssClasses,
    loadPanelThemePreference,
    parseHideCssClasses,
    parsePanelTheme,
    saveHideCssClasses,
    savePanelThemePreference,
    type PanelThemePreference,
    HIDE_CSS_CLASSES_KEY,
    PANEL_THEME_KEY,
} from '../shared/prefs';

const hideCssClassesToggle = document.querySelector<HTMLInputElement>('#hideCssClasses');
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="panelTheme"]');
const storeRateLink = document.querySelector<HTMLAnchorElement>('#storeRateLink');

/** Listing URL from the installed extension id (stable after Chrome Web Store publish). */
function wireStoreRateLink(): void {
    if (!storeRateLink) return;
    storeRateLink.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;
}

async function syncHideCssClassesFromStorage(): Promise<void> {
    if (!hideCssClassesToggle) return;
    hideCssClassesToggle.checked = await loadHideCssClasses();
}

function wireHideCssClassesToggle(): void {
    if (!hideCssClassesToggle) return;

    hideCssClassesToggle.addEventListener('change', () => {
        void saveHideCssClasses(hideCssClassesToggle.checked);
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

    const hideClassesChange = changes[HIDE_CSS_CLASSES_KEY];
    if (hideClassesChange && hideCssClassesToggle) {
        hideCssClassesToggle.checked = parseHideCssClasses(hideClassesChange.newValue);
    }

    const themeChange = changes[PANEL_THEME_KEY];
    if (themeChange) {
        setThemeRadios(parsePanelTheme(themeChange.newValue));
    }
});

void syncHideCssClassesFromStorage();
wireHideCssClassesToggle();
void syncThemeFromStorage();
wireThemeRadios();
wireStoreRateLink();
