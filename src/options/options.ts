/*!
 * Style Detective — options page script.
 *
 * Loads and persists preferences from chrome.storage.local. Keep UI logic
 * small; share keys with the content script via ../shared/prefs.
 */

import {
    loadPanelThemePreference,
    loadUtilityFirstExtras,
    parsePanelTheme,
    parseUtilityFirstExtras,
    savePanelThemePreference,
    saveUtilityFirstExtras,
    type PanelThemePreference,
    PANEL_THEME_KEY,
    UTILITY_FIRST_EXTRAS_KEY,
} from '../shared/prefs';

const utilityFirstToggle = document.querySelector<HTMLInputElement>('#utilityFirstExtras');
const themeRadios = document.querySelectorAll<HTMLInputElement>('input[name="panelTheme"]');

async function syncUtilityFirstFromStorage(): Promise<void> {
    if (!utilityFirstToggle) return;
    utilityFirstToggle.checked = await loadUtilityFirstExtras();
}

function wireUtilityFirstToggle(): void {
    if (!utilityFirstToggle) return;

    utilityFirstToggle.addEventListener('change', () => {
        void saveUtilityFirstExtras(utilityFirstToggle.checked);
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

    const utilityChange = changes[UTILITY_FIRST_EXTRAS_KEY];
    if (utilityChange && utilityFirstToggle) {
        utilityFirstToggle.checked = parseUtilityFirstExtras(utilityChange.newValue);
    }

    const themeChange = changes[PANEL_THEME_KEY];
    if (themeChange) {
        setThemeRadios(parsePanelTheme(themeChange.newValue));
    }
});

void syncUtilityFirstFromStorage();
wireUtilityFirstToggle();
void syncThemeFromStorage();
wireThemeRadios();
