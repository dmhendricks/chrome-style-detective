/*!
 * Shared preference keys and helpers for options page + content script.
 * Keep storage key names and defaults in one place so they do not drift.
 */

/** Overlay panel color scheme. Default: follow OS. */
export const PANEL_THEME_KEY = 'panelTheme';

export type PanelThemePreference = 'light' | 'dark' | 'system';

export const PANEL_THEME_DEFAULT: PanelThemePreference = 'system';

export function parsePanelTheme(value: unknown): PanelThemePreference {
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    return PANEL_THEME_DEFAULT;
}

export async function loadPanelThemePreference(): Promise<PanelThemePreference> {
    const stored = await chrome.storage.local.get(PANEL_THEME_KEY);
    return parsePanelTheme(stored[PANEL_THEME_KEY]);
}

export async function savePanelThemePreference(theme: PanelThemePreference): Promise<void> {
    await chrome.storage.local.set({ [PANEL_THEME_KEY]: theme });
}

/** Resolve a stored preference to the concrete scheme applied to the overlay. */
export function resolvePanelTheme(
    preference: PanelThemePreference,
    systemIsDark: boolean,
): 'light' | 'dark' {
    if (preference === 'system') return systemIsDark ? 'dark' : 'light';
    return preference;
}
