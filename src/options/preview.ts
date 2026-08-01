/*!
 * Style Detective — options-page overlay preview.
 *
 * Static fixture that mirrors the real panel chrome so Settings toggles can
 * update a live mock without booting the content-script controller.
 */

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
] as const;

/** Chips that typically fit on one line in the mock at default font size. */
const CHIPS_PER_LINE = 3;

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

function colorSwatchMarkup(cssColor: string): string {
    return `<span class="StyleDetectiveOverlay__color-swatch"><span class="StyleDetectiveOverlay__color-swatch-fill" style="background-color: ${cssColor} !important"></span></span>`;
}

function valueGroupMarkup(value: string, badge?: { text: string; tone: string }): string {
    const leading = value.match(COLOR_TOKEN_RE)?.[0] ?? null;
    const swatch = leading ? colorSwatchMarkup(leading) : '';
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
      <h2 data-preview="classes-heading">Classes (8)</h2>
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

function renderChips(container: HTMLElement, lines: number): void {
    const maxVisible = Math.max(1, lines) * CHIPS_PER_LINE;
    const tokens = MOCK_CLASSES;
    container.replaceChildren();

    const visible = Math.min(tokens.length, maxVisible);
    for (let i = 0; i < visible; i++) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'StyleDetectiveOverlay__class-chip';
        chip.textContent = tokens[i] ?? '';
        chip.tabIndex = -1;
        container.append(chip);
    }

    const hidden = tokens.length - visible;
    if (hidden > 0) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className =
            'StyleDetectiveOverlay__class-chip StyleDetectiveOverlay__class-chip--more';
        more.textContent = `+${hidden} more`;
        more.tabIndex = -1;
        container.append(more);
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
    applyTheme(overlay, state.theme);
    bindSystemThemeListener();

    const classes = root.querySelector<HTMLElement>('[data-preview="classes"]');
    classes?.classList.toggle('StyleDetectiveOverlay__classes--hidden', !state.showCssClasses);

    const chips = root.querySelector<HTMLElement>('[data-preview="chips"]');
    if (chips && state.showCssClasses) {
        renderChips(chips, state.classesChipLines);
    }

    const boxModel = root.querySelector<HTMLElement>('[data-preview="box-model"] .StyleDetectiveOverlay__box-model');
    boxModel?.classList.toggle('StyleDetectiveOverlay__box-model--hidden', !state.showBoxModel);

    // When diagram is off, reveal the covered shorthand rows.
    const boxUl = root.querySelectorAll('#StyleDetectiveOverlay__pBox ul > li');
    for (const li of boxUl) {
        const prop = li.querySelector('.StyleDetectiveOverlay__property')?.textContent?.trim();
        if (prop === 'margin' || prop === 'padding' || prop === 'border') {
            li.classList.toggle('StyleDetectiveOverlay__row--hidden', state.showBoxModel);
        }
    }
}
