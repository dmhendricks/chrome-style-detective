/*!
 * Style Detective — options page script.
 *
 * Loads and persists preferences from chrome.storage.local. Keep UI logic
 * small; share keys with the content script via ../shared/prefs.
 */

import {
    loadPanelThemePreference,
    parsePanelTheme,
    savePanelThemePreference,
    type PanelThemePreference,
    PANEL_THEME_KEY,
} from '../shared/prefs';

const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="panelTheme"]');

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

    const themeChange = changes[PANEL_THEME_KEY];
    if (themeChange) {
        setThemeRadios(parsePanelTheme(themeChange.newValue));
    }
});

void syncThemeFromStorage();
wireThemeRadios();
