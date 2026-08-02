/*!
 * Style Detective — options-page overlay preview.
 *
 * Static fixture that mirrors the real panel chrome so Settings toggles can
 * update a live mock without booting the content-script controller.
 */

import { countChipRows } from '../content/lib/classes';
import { extractFirstCssGradient } from '../content/lib/format';
import { DARK_CLASS, OVERLAY_ID } from '../shared/dom-ids';
import {
    resolvePanelTheme,
    type PanelThemePreference,
} from '../shared/prefs';

export interface PreviewState {
    theme: PanelThemePreference;
    showCssClasses: boolean;
    classesChipLines: number;
    showBoxModel: boolean;
    panelFontSize: number;
}

const MOCK_CLASSES = [
    'btn',
    'btn-ghost',
    'btn--primary',
    'is-active',
    'rounded-lg',
    'shadow-sm',
    'hover:opacity-90',
    'focus:ring-2',
    'transition',
    'duration-150',
    'ease-out',
    'disabled:opacity-50',
] as const;

function systemPrefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function boxModelHtml(): string {
    const side = (cls: string, value: string) =>
        `<span class="StyleDetectiveOverlay__box-model-label StyleDetectiveOverlay__box-model-label--${cls}">${value}</span>`;

    const ring = (layer: string, sides: { t: string; r: string; b: string; l: string }, inner: string) => `
      <div class="StyleDetectiveOverlay__box-model-ring StyleDetectiveOverlay__box-model-ring--${layer}">
        <span class="StyleDetectiveOverlay__box-model-layer">${layer}</span>
        ${side('top', sides.t)}
        <div class="StyleDetectiveOverlay__box-model-mid">
          ${side('left', sides.l)}
          ${inner}
          ${side('right', sides.r)}
        </div>
        ${side('bottom', sides.b)}
      </div>`;

    const content =
        '<div class="StyleDetectiveOverlay__box-model-content">101 × 34</div>';
    const padding = ring('padding', { t: '0', r: '14px', b: '0', l: '14px' }, content);
    const border = ring('border', { t: '2px', r: '2px', b: '2px', l: '2px' }, padding);
    const margin = ring('margin', { t: '0', r: '0', b: '0', l: '0' }, border);

    return `<div class="StyleDetectiveOverlay__box-model">${margin}</div>`;
}

/** Hex or rgb()/rgba() — mirrors `COLOR_TOKEN_RE` in content/lib/dom.ts. */
const COLOR_TOKEN_RE =
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/i;

function colorSwatchMarkup(cssFill: string, asImage = false): string {
    const style = asImage
        ? `background-image: ${cssFill} !important`
        : `background-color: ${cssFill} !important`;
    return `<span class="StyleDetectiveOverlay__color-swatch"><span class="StyleDetectiveOverlay__color-swatch-fill" style="${style}"></span></span>`;
}

function valueGroupMarkup(value: string, badge?: { text: string; tone: string }): string {
    const gradient = extractFirstCssGradient(value);
    const swatch = gradient
        ? colorSwatchMarkup(gradient, true)
        : (() => {
              const leading = value.match(COLOR_TOKEN_RE)?.[0] ?? null;
              return leading ? colorSwatchMarkup(leading) : '';
          })();
    const pill = badge
        ? `<span class="StyleDetectiveOverlay__contrast-badge StyleDetectiveOverlay__contrast-badge--${badge.tone}" title="WCAG ${badge.text}">${badge.text}</span>`
        : '';
    return `<span class="StyleDetectiveOverlay__value-group"><span class="StyleDetectiveOverlay__value-text">${swatch}${value}${pill}</span></span>`;
}

function propertyRow(
    name: string,
    value: string,
    hidden = false,
    badge?: { text: string; tone: string },
): string {
    return `
      <li class="${hidden ? 'StyleDetectiveOverlay__row--hidden' : ''}">
        <span class="StyleDetectiveOverlay__property">${name}</span>
        <span class="StyleDetectiveOverlay__value">${valueGroupMarkup(value, badge)}</span>
      </li>`;
}

function buildOverlayHtml(): string {
    return `
<div id="${OVERLAY_ID}" style="display:flex">
  <h1><span class="StyleDetectiveOverlay__selector">BUTTON</span></h1>

  <div class="StyleDetectiveOverlay__classes" data-preview="classes">
    <div class="StyleDetectiveOverlay__classes-head">
      <h2 data-preview="classes-heading">Classes (12)</h2>
      <button type="button" class="StyleDetectiveOverlay__classes-copy-all" tabindex="-1">Copy All</button>
    </div>
    <div class="StyleDetectiveOverlay__class-chips" data-preview="chips"></div>
  </div>

  <div id="StyleDetectiveOverlay__center">
    <div class="StyleDetectiveOverlay__category" id="StyleDetectiveOverlay__pBox">
      <h2>Box</h2>
      <div data-preview="box-model">${boxModelHtml()}</div>
      <ul>
        ${propertyRow('width', '101px')}
        ${propertyRow('height', '34px')}
        ${propertyRow('border-radius', '8px')}
        ${propertyRow('margin', '0', true)}
        ${propertyRow('padding', '0 14px', true)}
        ${propertyRow('border', '2px solid #9F1239', true)}
        ${propertyRow('border-color', '#9F1239', true)}
      </ul>
    </div>
    <div class="StyleDetectiveOverlay__category">
      <h2>Font &amp; Text</h2>
      <ul>
        ${propertyRow('font-family', 'Inter, sans-serif')}
        ${propertyRow('font-size', '14px')}
        ${propertyRow('font-weight', '600')}
      </ul>
    </div>
    <div class="StyleDetectiveOverlay__category" data-preview="color">
      <h2>Color &amp; Background</h2>
      <ul>
        ${propertyRow('color', '#00D4AA')}
        ${propertyRow('background-color', 'transparent')}
        ${propertyRow('contrast', '11.00:1', false, { text: 'AAA', tone: 'aaa' })}
      </ul>
    </div>
  </div>

  <div id="StyleDetectiveOverlay__footer">
    <div class="StyleDetectiveOverlay__shortcuts">
      <span class="StyleDetectiveOverlay__shortcut"><kbd>F</kbd><span class="StyleDetectiveOverlay__shortcut-label">Freeze</span></span>
      <span class="StyleDetectiveOverlay__shortcut"><kbd>C</kbd><span class="StyleDetectiveOverlay__shortcut-label">Copy</span></span>
      <span class="StyleDetectiveOverlay__shortcut"><kbd>+/−</kbd><span class="StyleDetectiveOverlay__shortcut-label">Zoom</span></span>
      <span class="StyleDetectiveOverlay__shortcut"><kbd>S</kbd><span class="StyleDetectiveOverlay__shortcut-label">Settings</span></span>
      <span class="StyleDetectiveOverlay__shortcut"><kbd>Esc</kbd><span class="StyleDetectiveOverlay__shortcut-label">Close</span></span>
    </div>
  </div>
</div>`;
}

let root: HTMLElement | null = null;
let systemThemeMedia: MediaQueryList | null = null;
let onSystemThemeChange: (() => void) | null = null;
let latestState: PreviewState | null = null;

/** Live panel min-width factor — keep in sync with content/style.scss. */
const LIVE_MIN_WIDTH_FACTOR = 33.2;
/** Floor matching the default `--sd-preview-width: 22rem` at 16px root. */
const PREVIEW_COLUMN_FLOOR_PX = 22 * 16;
/** Cap so the sticky column doesn't dominate small desktops. */
const PREVIEW_COLUMN_CEIL_PX = 40 * 16;
/** Stage padding + frame inset so the mock isn't tight against the card edge. */
const PREVIEW_STAGE_CHROME_PX = 36;
/** Floor matching the default `--sd-max: 72rem` at 16px root. */
const PAGE_MAX_FLOOR_PX = 72 * 16;

/**
 * Widen the sticky preview column with panel font size so the mock can use the
 * same font-scaled min-width as the live overlay. Grow `--sd-max` by the same
 * delta so the centered page shell expands outward instead of crushing Settings.
 */
function syncPreviewColumnWidth(fontSize: number): void {
    const natural = fontSize * LIVE_MIN_WIDTH_FACTOR + PREVIEW_STAGE_CHROME_PX;
    const width = Math.min(
        PREVIEW_COLUMN_CEIL_PX,
        Math.max(PREVIEW_COLUMN_FLOOR_PX, Math.round(natural)),
    );
    const previewGrowth = width - PREVIEW_COLUMN_FLOOR_PX;
    document.documentElement.style.setProperty('--sd-preview-width', `${width}px`);
    document.documentElement.style.setProperty(
        '--sd-max',
        `${PAGE_MAX_FLOOR_PX + previewGrowth}px`,
    );
}

/**
 * Paint mock class chips using the same wrap-line measurement as the live panel
 * (`countChipRows` + binary search), not a fixed chips-per-line guess.
 */
function renderChips(container: HTMLElement, lines: number): void {
    const tokens = MOCK_CLASSES;
    const maxLines = Math.max(1, lines);

    const appendTokenChip = (token: string): void => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'StyleDetectiveOverlay__class-chip';
        chip.textContent = token;
        chip.tabIndex = -1;
        container.append(chip);
    };

    const appendMoreChip = (hiddenCount: number): void => {
        const more = document.createElement('button');
        more.type = 'button';
        more.className =
            'StyleDetectiveOverlay__class-chip StyleDetectiveOverlay__class-chip--more';
        more.textContent = `+${hiddenCount} more`;
        more.tabIndex = -1;
        container.append(more);
    };

    const paint = (visibleCount: number, withMore: boolean): void => {
        container.replaceChildren();
        for (let i = 0; i < visibleCount; i++) {
            const token = tokens[i];
            if (token !== undefined) appendTokenChip(token);
        }
        if (withMore) appendMoreChip(tokens.length - visibleCount);
    };

    // Prefer showing every chip when it fits within the configured wrap lines.
    paint(tokens.length, false);
    if (countChipRows(container) > maxLines) {
        let lo = 1;
        let hi = tokens.length - 1;
        let best = 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            paint(mid, true);
            if (countChipRows(container) <= maxLines) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        paint(best, true);
    }

    const heading = root?.querySelector('[data-preview="classes-heading"]');
    if (heading) heading.textContent = `Classes (${tokens.length})`;
}

function applyTheme(overlay: HTMLElement, theme: PanelThemePreference): void {
    const dark = resolvePanelTheme(theme, systemPrefersDark()) === 'dark';
    overlay.classList.toggle(DARK_CLASS, dark);
}

function bindSystemThemeListener(): void {
    if (!systemThemeMedia) {
        systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    }
    if (onSystemThemeChange) {
        systemThemeMedia.removeEventListener('change', onSystemThemeChange);
    }
    onSystemThemeChange = () => {
        if (!latestState || latestState.theme !== 'system' || !root) return;
        const overlay = root.querySelector<HTMLElement>(`#${OVERLAY_ID}`);
        if (overlay) applyTheme(overlay, 'system');
    };
    systemThemeMedia.addEventListener('change', onSystemThemeChange);
}

/** Mount the mock overlay once into `host`. */
export function mountPreview(host: HTMLElement): void {
    host.innerHTML = buildOverlayHtml();
    root = host;
}

/** Update mock visibility / theme / font from current prefs. */
export function renderPreview(state: PreviewState): void {
    if (!root) return;
    latestState = state;

    const overlay = root.querySelector<HTMLElement>(`#${OVERLAY_ID}`);
    if (!overlay) return;

    overlay.style.setProperty('--sd-font-size', `${state.panelFontSize}px`);
    // Live max-width uses 100vw (options tab here). Pin it so min-width can
    // follow font size instead of the options viewport.
    overlay.style.setProperty('--sd-max-width', `${PREVIEW_COLUMN_CEIL_PX}px`);
    syncPreviewColumnWidth(state.panelFontSize);
    applyTheme(overlay, state.theme);
    bindSystemThemeListener();

    const classes = root.querySelector<HTMLElement>('[data-preview="classes"]');
    classes?.classList.toggle('StyleDetectiveOverlay__classes--hidden', !state.showCssClasses);

    const chips = root.querySelector<HTMLElement>('[data-preview="chips"]');
    if (chips && state.showCssClasses) {
        renderChips(chips, state.classesChipLines);
        // Remeasure after column width / font-size layout settles (same as live panel).
        requestAnimationFrame(() => {
            if (latestState?.showCssClasses) {
                renderChips(chips, latestState.classesChipLines);
            }
        });
    }

    const boxModel = root.querySelector<HTMLElement>('[data-preview="box-model"] .StyleDetectiveOverlay__box-model');
    boxModel?.classList.toggle('StyleDetectiveOverlay__box-model--hidden', !state.showBoxModel);

    // When diagram is off, reveal the covered shorthand rows; when on, reveal
    // diagram-only color detail (border-color) instead of the full border row.
    const boxUl = root.querySelectorAll('#StyleDetectiveOverlay__pBox ul > li');
    for (const li of boxUl) {
        const prop = li.querySelector('.StyleDetectiveOverlay__property')?.textContent?.trim();
        if (prop === 'margin' || prop === 'padding' || prop === 'border') {
            li.classList.toggle('StyleDetectiveOverlay__row--hidden', state.showBoxModel);
        }
        if (prop === 'border-color') {
            li.classList.toggle('StyleDetectiveOverlay__row--hidden', !state.showBoxModel);
        }
    }
}
