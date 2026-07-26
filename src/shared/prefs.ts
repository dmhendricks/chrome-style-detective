/*!
 * Shared preference keys, Zod schemas, and helpers for options + content script.
 * Keep storage key names and defaults in one place so they do not drift.
 *
 * chrome.storage values are untyped across versions — schemas parse unknown
 * payloads and heal bad writes back to defaults (see docs/deferred-backlog P1d).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a local storage key, parse with Zod, and rewrite the default when the
 * stored value is present but invalid. Missing keys stay missing (return default).
 */
async function loadLocalPref<T>(
    key: string,
    schema: z.ZodType<T>,
    defaultValue: T,
): Promise<T> {
    const stored = await chrome.storage.local.get(key);
    if (!(key in stored)) return defaultValue;

    const result = schema.safeParse(stored[key]);
    if (result.success) return result.data;

    await chrome.storage.local.set({ [key]: defaultValue });
    return defaultValue;
}

// ---------------------------------------------------------------------------
// Panel theme
// ---------------------------------------------------------------------------

/** Overlay panel color scheme. Default: follow OS. */
export const PANEL_THEME_KEY = 'panelTheme';

export const panelThemeSchema = z.enum(['light', 'dark', 'system']);

export type PanelThemePreference = z.infer<typeof panelThemeSchema>;

export const PANEL_THEME_DEFAULT: PanelThemePreference = 'system';

export function parsePanelTheme(value: unknown): PanelThemePreference {
    const result = panelThemeSchema.safeParse(value);
    return result.success ? result.data : PANEL_THEME_DEFAULT;
}

export async function loadPanelThemePreference(): Promise<PanelThemePreference> {
    return loadLocalPref(PANEL_THEME_KEY, panelThemeSchema, PANEL_THEME_DEFAULT);
}

export async function savePanelThemePreference(theme: PanelThemePreference): Promise<void> {
    await chrome.storage.local.set({ [PANEL_THEME_KEY]: panelThemeSchema.parse(theme) });
}

/** Resolve a stored preference to the concrete scheme applied to the overlay. */
export function resolvePanelTheme(
    preference: PanelThemePreference,
    systemIsDark: boolean,
): 'light' | 'dark' {
    if (preference === 'system') return systemIsDark ? 'dark' : 'light';
    return preference;
}

// ---------------------------------------------------------------------------
// Panel font size
// ---------------------------------------------------------------------------

export const PANEL_FONT_SIZE_KEY = 'panelFontSize';

export const PANEL_FONT_SIZE_DEFAULT = 11;
export const PANEL_FONT_SIZE_MIN = 8;
export const PANEL_FONT_SIZE_MAX = 18;
export const PANEL_FONT_SIZE_STEP = 1;

export const panelFontSizeSchema = z
    .number()
    .finite()
    .transform((n) => Math.round(n))
    .pipe(z.number().int().min(PANEL_FONT_SIZE_MIN).max(PANEL_FONT_SIZE_MAX));

export function clampPanelFontSize(size: number): number {
    return Math.min(PANEL_FONT_SIZE_MAX, Math.max(PANEL_FONT_SIZE_MIN, size));
}

export function parsePanelFontSize(value: unknown): number {
    const result = panelFontSizeSchema.safeParse(value);
    return result.success ? result.data : PANEL_FONT_SIZE_DEFAULT;
}

export async function loadPanelFontSize(): Promise<number> {
    const stored = await chrome.storage.local.get(PANEL_FONT_SIZE_KEY);
    if (!(PANEL_FONT_SIZE_KEY in stored)) return PANEL_FONT_SIZE_DEFAULT;

    const raw = stored[PANEL_FONT_SIZE_KEY];
    const result = panelFontSizeSchema.safeParse(raw);
    if (result.success) {
        // Heal out-of-band writes that still clamp (e.g. float → int).
        if (raw !== result.data) {
            await chrome.storage.local.set({ [PANEL_FONT_SIZE_KEY]: result.data });
        }
        return result.data;
    }

    await chrome.storage.local.set({ [PANEL_FONT_SIZE_KEY]: PANEL_FONT_SIZE_DEFAULT });
    return PANEL_FONT_SIZE_DEFAULT;
}

export async function savePanelFontSize(size: number): Promise<void> {
    const next = panelFontSizeSchema.parse(size);
    await chrome.storage.local.set({ [PANEL_FONT_SIZE_KEY]: next });
}

// ---------------------------------------------------------------------------
// Show CSS Classes section
// ---------------------------------------------------------------------------

/** Show the Classes chip row. Default: true. */
export const SHOW_CSS_CLASSES_KEY = 'showCssClasses';

/** Legacy key — migrated to `showCssClasses` on read (`!hideCssClasses`). */
const LEGACY_HIDE_CSS_CLASSES_KEY = 'hideCssClasses';

export const showCssClassesSchema = z.boolean();

export const SHOW_CSS_CLASSES_DEFAULT = true;

export function parseShowCssClasses(value: unknown): boolean {
    const result = showCssClassesSchema.safeParse(value);
    return result.success ? result.data : SHOW_CSS_CLASSES_DEFAULT;
}

export async function loadShowCssClasses(): Promise<boolean> {
    const stored = await chrome.storage.local.get([
        SHOW_CSS_CLASSES_KEY,
        LEGACY_HIDE_CSS_CLASSES_KEY,
    ]);

    if (SHOW_CSS_CLASSES_KEY in stored) {
        const result = showCssClassesSchema.safeParse(stored[SHOW_CSS_CLASSES_KEY]);
        if (result.success) return result.data;
        await chrome.storage.local.set({ [SHOW_CSS_CLASSES_KEY]: SHOW_CSS_CLASSES_DEFAULT });
        return SHOW_CSS_CLASSES_DEFAULT;
    }

    // Migrate inverted legacy pref once, then drop the old key.
    if (LEGACY_HIDE_CSS_CLASSES_KEY in stored) {
        const legacy = z.boolean().safeParse(stored[LEGACY_HIDE_CSS_CLASSES_KEY]);
        const shown = legacy.success ? !legacy.data : SHOW_CSS_CLASSES_DEFAULT;
        await chrome.storage.local.set({ [SHOW_CSS_CLASSES_KEY]: shown });
        await chrome.storage.local.remove(LEGACY_HIDE_CSS_CLASSES_KEY);
        return shown;
    }

    return SHOW_CSS_CLASSES_DEFAULT;
}

export async function saveShowCssClasses(shown: boolean): Promise<void> {
    await chrome.storage.local.set({
        [SHOW_CSS_CLASSES_KEY]: showCssClassesSchema.parse(shown),
    });
}

// ---------------------------------------------------------------------------
// Classes chip wrap lines (before "+N more")
// ---------------------------------------------------------------------------

/** How many wrap lines of class chips to show before "+N more". Default: 3. */
export const CLASSES_CHIP_LINES_KEY = 'classesChipLines';

export const CLASSES_CHIP_LINES_DEFAULT = 3;
export const CLASSES_CHIP_LINES_MIN = 1;
export const CLASSES_CHIP_LINES_MAX = 9;

export const classesChipLinesSchema = z
    .number()
    .finite()
    .transform((n) => Math.round(n))
    .pipe(z.number().int().min(CLASSES_CHIP_LINES_MIN).max(CLASSES_CHIP_LINES_MAX));

export function parseClassesChipLines(value: unknown): number {
    const result = classesChipLinesSchema.safeParse(value);
    return result.success ? result.data : CLASSES_CHIP_LINES_DEFAULT;
}

export async function loadClassesChipLines(): Promise<number> {
    return loadLocalPref(
        CLASSES_CHIP_LINES_KEY,
        classesChipLinesSchema,
        CLASSES_CHIP_LINES_DEFAULT,
    );
}

export async function saveClassesChipLines(lines: number): Promise<void> {
    await chrome.storage.local.set({
        [CLASSES_CHIP_LINES_KEY]: classesChipLinesSchema.parse(lines),
    });
}

// ---------------------------------------------------------------------------
// Session: per-tab armed flag (service worker)
// ---------------------------------------------------------------------------

/** Session storage prefix: `sdArmed:<tabId>` → boolean. */
export const ARMED_KEY_PREFIX = 'sdArmed:';

export const sessionArmedSchema = z.boolean();

export function armedStorageKey(tabId: number): string {
    return `${ARMED_KEY_PREFIX}${tabId}`;
}

/** Parse a session armed value; anything other than a boolean is treated as false. */
export function parseSessionArmed(value: unknown): boolean {
    const result = sessionArmedSchema.safeParse(value);
    return result.success ? result.data : false;
}
