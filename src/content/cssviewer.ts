/*!
* Style Detective — Displays a floating panel of any hovered element's CSS properties.
*/

// === Globals ===

// The element currently being inspected, and its generated CSS text. Updated on
// every mouseover; read by the context-menu console dump and the [c] key prompt.
let StyleDetectiveOverlay_element: HTMLElement | null = null;
let StyleDetectiveOverlay_element_cssDefinition = '';
let StyleDetectiveOverlay_current_element: HTMLElement | null = null;

// CSS Properties
const StyleDetectiveOverlay_pFont = [
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'letter-spacing',
    'line-height',
    'text-decoration',
    'text-align',
    'text-indent',
    'text-transform',
    'vertical-align',
    'white-space',
    'word-spacing',
];

const StyleDetectiveOverlay_pColorBg = [
    'background-attachment',
    'background-color',
    'background-image',
    'background-position',
    'background-repeat',
    'color',
];

const StyleDetectiveOverlay_pBox = [
    'height',
    'width',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'margin',
    'padding',
    'max-height',
    'min-height',
    'max-width',
    'min-width',
];

const StyleDetectiveOverlay_pPositioning = [
    'position',
    'top',
    'bottom',
    'right',
    'left',
    'float',
    'display',
    'clear',
    'z-index',
];

const StyleDetectiveOverlay_pList = ['list-style-image', 'list-style-type', 'list-style-position'];

const StyleDetectiveOverlay_pTable = [
    'border-collapse',
    'border-spacing',
    'caption-side',
    'empty-cells',
    'table-layout',
];

const StyleDetectiveOverlay_pMisc = ['overflow', 'cursor', 'visibility'];

const StyleDetectiveOverlay_pEffect = [
    'transform',
    'transition',
    'outline',
    'outline-offset',
    'box-sizing',
    'resize',
    'text-shadow',
    'text-overflow',
    'word-wrap',
    'box-shadow',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
];

// CSS Property categories
const StyleDetectiveOverlay_categories: Record<string, string[]> = {
    pFontText: StyleDetectiveOverlay_pFont,
    pColorBg: StyleDetectiveOverlay_pColorBg,
    pBox: StyleDetectiveOverlay_pBox,
    pPositioning: StyleDetectiveOverlay_pPositioning,
    pList: StyleDetectiveOverlay_pList,
    pTable: StyleDetectiveOverlay_pTable,
    pMisc: StyleDetectiveOverlay_pMisc,
    pEffect: StyleDetectiveOverlay_pEffect,
};

const StyleDetectiveOverlay_categoriesTitle: Record<string, string> = {
    pFontText: 'Font & Text',
    pColorBg: 'Color & Background',
    pBox: 'Box',
    pPositioning: 'Positioning',
    pList: 'List',
    pTable: 'Table',
    pMisc: 'Miscellaneous',
    pEffect: 'Effects',
};

// Table tagnames
const StyleDetectiveOverlay_tableTagNames = [
    'TABLE',
    'CAPTION',
    'THEAD',
    'TBODY',
    'TFOOT',
    'COLGROUP',
    'COL',
    'TR',
    'TH',
    'TD',
];

const StyleDetectiveOverlay_listTagNames = ['UL', 'LI', 'DD', 'DT', 'OL'];

// === Utils ===

function GetCurrentDocument(): Document {
    return window.document;
}

function IsInArray(array: string[], name: string): boolean {
    for (let i = 0; i < array.length; i++) {
        if (name == array[i]) return true;
    }

    return false;
}

function DecToHex(nb: number): string {
    // Clamp to a whole byte so a fractional or out-of-range value (e.g. an
    // alpha channel like 0.067) can't produce a malformed hex pair.
    const byte = Math.max(0, Math.min(255, Math.round(nb)));

    return byte.toString(16).toUpperCase().padStart(2, '0');
}

function RGBToHex(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end);

    // Modern browsers report colors as rgb()/rgba() and may include a 4th alpha
    // component (e.g. "rgba(101, 108, 118, 0.067)"). Only the first three are
    // RGB channels; take those and ignore any alpha.
    const rgbValues = str.split(',').slice(0, 3);
    let hexStr = '#';

    for (let i = 0; i < rgbValues.length; i++) {
        hexStr += DecToHex(Number(rgbValues[i]));
    }

    if (hexStr == '#000000') {
        hexStr = '#FFFFFF';
    }

    hexStr =
        '<span style="border: 1px solid #000000 !important;width: 8px !important;height: 8px !important;display: inline-block !important;background-color:' +
        hexStr +
        ' !important;"></span> ' +
        hexStr;

    return hexStr;
}

function GetFileName(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end);

    const path = str.split('/');

    return path[path.length - 1] ?? '';
}

function RemoveExtraFloat(nb: string): string {
    return Math.round(Number(nb.substr(0, nb.length - 2))) + 'px';
}

// === CSS property helpers ===

function GetCSSProperty(element: CSSStyleDeclaration, property: string): string {
    return element.getPropertyValue(property);
}

function SetCSSProperty(element: CSSStyleDeclaration, property: string): void {
    const document = GetCurrentDocument();
    const li = document.getElementById('StyleDetectiveOverlay__' + property);
    if (!li || !li.lastChild) return;

    (li.lastChild as HTMLElement).innerHTML = ' : ' + element.getPropertyValue(property);
}

function SetCSSPropertyIf(
    element: CSSStyleDeclaration,
    property: string,
    condition: boolean,
): number {
    const document = GetCurrentDocument();
    const li = document.getElementById('StyleDetectiveOverlay__' + property);
    if (!li) return 0;

    if (condition) {
        if (li.lastChild) {
            (li.lastChild as HTMLElement).innerHTML = ' : ' + element.getPropertyValue(property);
        }
        li.style.display = 'block';

        return 1;
    } else {
        li.style.display = 'none';

        return 0;
    }
}

function SetCSSPropertyValue(
    _element: CSSStyleDeclaration,
    property: string,
    value: string,
): void {
    const document = GetCurrentDocument();
    const li = document.getElementById('StyleDetectiveOverlay__' + property);
    if (!li || !li.lastChild) return;

    (li.lastChild as HTMLElement).innerHTML = ' : ' + value;
    li.style.display = 'block';
}

function SetCSSPropertyValueIf(
    _element: CSSStyleDeclaration,
    property: string,
    value: string,
    condition: boolean,
): number {
    const document = GetCurrentDocument();
    const li = document.getElementById('StyleDetectiveOverlay__' + property);
    if (!li) return 0;

    if (condition) {
        if (li.lastChild) {
            (li.lastChild as HTMLElement).innerHTML = ' : ' + value;
        }
        li.style.display = 'block';

        return 1;
    } else {
        li.style.display = 'none';

        return 0;
    }
}

function HideCSSProperty(property: string): void {
    const document = GetCurrentDocument();
    const li = document.getElementById('StyleDetectiveOverlay__' + property);
    if (li) li.style.display = 'none';
}

function HideCSSCategory(category: string): void {
    const document = GetCurrentDocument();
    const div = document.getElementById('StyleDetectiveOverlay__' + category);
    if (div) div.style.display = 'none';
}

function ShowCSSCategory(category: string): void {
    const document = GetCurrentDocument();
    const div = document.getElementById('StyleDetectiveOverlay__' + category);
    if (div) div.style.display = 'block';
}

function UpdatefontText(element: CSSStyleDeclaration): void
{
    // Font
    SetCSSProperty(element, 'font-family');
    SetCSSProperty(element, 'font-size');

    SetCSSPropertyIf(element, 'font-weight'    , GetCSSProperty(element, 'font-weight') != '400');
    SetCSSPropertyIf(element, 'font-variant'   , GetCSSProperty(element, 'font-variant') != 'normal');
    SetCSSPropertyIf(element, 'font-style'     , GetCSSProperty(element, 'font-style') != 'normal');

    // Text
    SetCSSPropertyIf(element, 'letter-spacing' , GetCSSProperty(element, 'letter-spacing') != 'normal');
    SetCSSPropertyIf(element, 'line-height'    , GetCSSProperty(element, 'line-height') != 'normal');
    SetCSSPropertyIf(element, 'text-decoration', GetCSSProperty(element, 'text-decoration') != 'none');
    SetCSSPropertyIf(element, 'text-align'     , GetCSSProperty(element, 'text-align') != 'start');
    SetCSSPropertyIf(element, 'text-indent'    , GetCSSProperty(element, 'text-indent') != '0px');
    SetCSSPropertyIf(element, 'text-transform' , GetCSSProperty(element, 'text-transform') != 'none');
    SetCSSPropertyIf(element, 'vertical-align' , GetCSSProperty(element, 'vertical-align') != 'baseline');
    SetCSSPropertyIf(element, 'white-space'    , GetCSSProperty(element, 'white-space') != 'normal');
    SetCSSPropertyIf(element, 'word-spacing'   , GetCSSProperty(element, 'word-spacing') != 'normal');
}

function UpdateColorBg(element: CSSStyleDeclaration): void
{
    // Color
    SetCSSPropertyValue(element, 'color', RGBToHex(GetCSSProperty(element, 'color')));

    // Background
    SetCSSPropertyValueIf(element, 'background-color', RGBToHex(GetCSSProperty(element, 'background-color')), GetCSSProperty(element, 'background-color') != 'transparent');
    SetCSSPropertyIf(element, 'background-attachment', GetCSSProperty(element, 'background-attachment') != 'scroll');
    SetCSSPropertyValueIf(element, 'background-image', GetFileName(GetCSSProperty(element, 'background-image')), GetCSSProperty(element, 'background-image') != 'none');
    SetCSSPropertyIf(element, 'background-position'  , GetCSSProperty(element, 'background-position') != '');
    SetCSSPropertyIf(element, 'background-repeat'    , GetCSSProperty(element, 'background-repeat') != 'repeat');
}

function UpdateBox(element: CSSStyleDeclaration): void
{
    // Width/Height
    SetCSSPropertyIf(element, 'height', RemoveExtraFloat(GetCSSProperty(element, 'height')) != 'auto');
    SetCSSPropertyIf(element, 'width', RemoveExtraFloat(GetCSSProperty(element, 'width')) != 'auto');

    // Border
    const borderTop    = RemoveExtraFloat(GetCSSProperty(element, 'border-top-width')) + ' ' + GetCSSProperty(element, 'border-top-style') + ' ' + RGBToHex(GetCSSProperty(element, 'border-top-color'));
    const borderBottom = RemoveExtraFloat(GetCSSProperty(element, 'border-bottom-width')) + ' ' + GetCSSProperty(element, 'border-bottom-style') + ' ' + RGBToHex(GetCSSProperty(element, 'border-bottom-color'));
    const borderRight  = RemoveExtraFloat(GetCSSProperty(element, 'border-right-width')) + ' ' + GetCSSProperty(element, 'border-right-style') + ' ' + RGBToHex(GetCSSProperty(element, 'border-right-color'));
    const borderLeft   = RemoveExtraFloat(GetCSSProperty(element, 'border-left-width')) + ' ' + GetCSSProperty(element, 'border-left-style') + ' ' + RGBToHex(GetCSSProperty(element, 'border-left-color'));

    if (borderTop == borderBottom && borderBottom == borderRight && borderRight == borderLeft && GetCSSProperty(element, 'border-top-style') != 'none') {
        SetCSSPropertyValue(element, 'border', borderTop);

        HideCSSProperty('border-top');
        HideCSSProperty('border-bottom');
        HideCSSProperty('border-right');
        HideCSSProperty('border-left');
    }
    else {
        SetCSSPropertyValueIf(element, 'border-top'   , borderTop   , GetCSSProperty(element, 'border-top-style') != 'none');
        SetCSSPropertyValueIf(element, 'border-bottom', borderBottom, GetCSSProperty(element, 'border-bottom-style') != 'none');
        SetCSSPropertyValueIf(element, 'border-right' , borderRight , GetCSSProperty(element, 'border-right-style') != 'none');
        SetCSSPropertyValueIf(element, 'border-left'  , borderLeft  , GetCSSProperty(element, 'border-left-style') != 'none');

        HideCSSProperty('border');
    }

    // Margin
    const marginTop    = RemoveExtraFloat(GetCSSProperty(element, 'margin-top'));
    const marginBottom = RemoveExtraFloat(GetCSSProperty(element, 'margin-bottom'));
    const marginRight  = RemoveExtraFloat(GetCSSProperty(element, 'margin-right'));
    const marginLeft   = RemoveExtraFloat(GetCSSProperty(element, 'margin-left'));
    const margin       = (marginTop == '0px' ? '0' : marginTop) + ' ' + (marginRight == '0px' ? '0' : marginRight) + ' '  + (marginBottom == '0px' ? '0' : marginBottom) + ' '  + (marginLeft == '0px' ? '0' : marginLeft);

    SetCSSPropertyValueIf(element, 'margin', margin, margin != '0 0 0 0');

    // padding
    const paddingTop    = RemoveExtraFloat(GetCSSProperty(element, 'padding-top'));
    const paddingBottom = RemoveExtraFloat(GetCSSProperty(element, 'padding-bottom'));
    const paddingRight  = RemoveExtraFloat(GetCSSProperty(element, 'padding-right'));
    const paddingLeft   = RemoveExtraFloat(GetCSSProperty(element, 'padding-left'));
    const padding       = (paddingTop == '0px' ? '0' : paddingTop) + ' ' + (paddingRight == '0px' ? '0' : paddingRight) + ' '  + (paddingBottom == '0px' ? '0' : paddingBottom) + ' '  + (paddingLeft == '0px' ? '0' : paddingLeft);

    SetCSSPropertyValueIf(element, 'padding', padding, padding != '0 0 0 0');

    // Max/Min Width/Height
    SetCSSPropertyIf(element, 'min-height', GetCSSProperty(element, 'min-height') != '0px');
    SetCSSPropertyIf(element, 'max-height', GetCSSProperty(element, 'max-height') != 'none');
    SetCSSPropertyIf(element, 'min-width' , GetCSSProperty(element, 'min-width') != '0px');
    SetCSSPropertyIf(element, 'max-width' , GetCSSProperty(element, 'max-width') != 'none');
}

function UpdatePositioning(element: CSSStyleDeclaration): void
{
    SetCSSPropertyIf(element, 'position', GetCSSProperty(element, 'position') != 'static');
    SetCSSPropertyIf(element, 'top'     , GetCSSProperty(element, 'top') != 'auto');
    SetCSSPropertyIf(element, 'bottom'  , GetCSSProperty(element, 'bottom') != 'auto');
    SetCSSPropertyIf(element, 'right'   , GetCSSProperty(element, 'right') != 'auto');
    SetCSSPropertyIf(element, 'left'    , GetCSSProperty(element, 'left') != 'auto');
    SetCSSPropertyIf(element, 'float'   , GetCSSProperty(element, 'float') != 'none');

    SetCSSProperty(element, 'display');

    SetCSSPropertyIf(element, 'clear'   , GetCSSProperty(element, 'clear') != 'none');
    SetCSSPropertyIf(element, 'z-index' , GetCSSProperty(element, 'z-index') != 'auto');
}

function UpdateTable(element: CSSStyleDeclaration, tagName: string): void
{
    if (IsInArray(StyleDetectiveOverlay_tableTagNames, tagName)) {
        let nbProperties = 0;

        nbProperties += SetCSSPropertyIf(element, 'border-collapse', GetCSSProperty(element, 'border-collapse') != 'separate');
        nbProperties += SetCSSPropertyIf(element, 'border-spacing' , GetCSSProperty(element, 'border-spacing') != '0px 0px');
        nbProperties += SetCSSPropertyIf(element, 'caption-side'   , GetCSSProperty(element, 'caption-side') != 'top');
        nbProperties += SetCSSPropertyIf(element, 'empty-cells'    , GetCSSProperty(element, 'empty-cells') != 'show');
        nbProperties += SetCSSPropertyIf(element, 'table-layout'   , GetCSSProperty(element, 'table-layout') != 'auto');

        if (nbProperties > 0)
            ShowCSSCategory('pTable');
        else
            HideCSSCategory('pTable');
    }
    else {
        HideCSSCategory('pTable');
    }
}

function UpdateList(element: CSSStyleDeclaration, tagName: string): void
{
    if (IsInArray(StyleDetectiveOverlay_listTagNames, tagName)) {
        ShowCSSCategory('pList');

        const listStyleImage = GetCSSProperty(element, 'list-style-image');

        if (listStyleImage == 'none') {
            SetCSSProperty(element, 'list-style-type');
            HideCSSProperty('list-style-image');
        }
        else {
            SetCSSPropertyValue(element, 'list-style-image', listStyleImage);
            HideCSSProperty('list-style-type');
        }

        SetCSSProperty(element, 'list-style-position');
    }
    else {
        HideCSSCategory('pList');
    }
}

function UpdateMisc(element: CSSStyleDeclaration): void
{
    let nbProperties = 0;

    nbProperties += SetCSSPropertyIf(element, 'overflow'  , GetCSSProperty(element, 'overflow') != 'visible');
    nbProperties += SetCSSPropertyIf(element, 'cursor'    , GetCSSProperty(element, 'cursor') != 'auto');
    nbProperties += SetCSSPropertyIf(element, 'visibility', GetCSSProperty(element, 'visibility') != 'visible');

    if (nbProperties > 0)
        ShowCSSCategory('pMisc');
    else
        HideCSSCategory('pMisc');
}

function UpdateEffects(element: CSSStyleDeclaration): void
{
    let nbProperties = 0;

    nbProperties += SetCSSPropertyIf(element, 'transform'                 , GetCSSProperty(element, 'transform') !== '');
    nbProperties += SetCSSPropertyIf(element, 'transition'                , GetCSSProperty(element, 'transition') !== '');
    nbProperties += SetCSSPropertyIf(element, 'outline'                   , GetCSSProperty(element, 'outline') !== '');
    nbProperties += SetCSSPropertyIf(element, 'outline-offset'            , GetCSSProperty(element, 'outline-offset') != '0px');
    nbProperties += SetCSSPropertyIf(element, 'box-sizing'                , GetCSSProperty(element, 'box-sizing') != 'content-box');
    nbProperties += SetCSSPropertyIf(element, 'resize'                    , GetCSSProperty(element, 'resize') != 'none');

    nbProperties += SetCSSPropertyIf(element, 'text-shadow'               , GetCSSProperty(element, 'text-shadow') != 'none');
    nbProperties += SetCSSPropertyIf(element, 'text-overflow'             , GetCSSProperty(element, 'text-overflow') != 'clip');
    nbProperties += SetCSSPropertyIf(element, 'word-wrap'                 , GetCSSProperty(element, 'word-wrap') != 'normal');
    nbProperties += SetCSSPropertyIf(element, 'box-shadow'                , GetCSSProperty(element, 'box-shadow') != 'none');

    nbProperties += SetCSSPropertyIf(element, 'border-top-left-radius'    , GetCSSProperty(element, 'border-top-left-radius') != '0px');
    nbProperties += SetCSSPropertyIf(element, 'border-top-right-radius'   , GetCSSProperty(element, 'border-top-right-radius') != '0px');
    nbProperties += SetCSSPropertyIf(element, 'border-bottom-left-radius' , GetCSSProperty(element, 'border-bottom-left-radius') != '0px');
    nbProperties += SetCSSPropertyIf(element, 'border-bottom-right-radius', GetCSSProperty(element, 'border-bottom-right-radius') != '0px');

    if (nbProperties > 0)
        ShowCSSCategory('pEffect');
    else
        HideCSSCategory('pEffect');
}

// === Event handlers ===

// Appends `property: value;` lines for every property in `props` to the running
// CSS definition string.
function appendCssDefinition(element: CSSStyleDeclaration, props: string[]): void {
    for (const property of props) {
        StyleDetectiveOverlay_element_cssDefinition +=
            '\t' + property + ': ' + element.getPropertyValue(property) + ';\n';
    }
}

// True if the element is the panel itself or lives inside it. The panel is
// appended to document.body, so AddEventListeners() attaches hover handlers to
// its own children too; without this guard, hovering the panel would re-inspect
// and reposition it, causing a flicker feedback loop (worst near the right edge,
// where small width changes flip the panel from one side of the cursor to the
// other every frame).
function isInsidePanel(el: HTMLElement | null): boolean {
    return !!el && !!el.closest && el.closest('#StyleDetectiveOverlay') != null;
}

function StyleDetectiveOverlayMouseOver(this: HTMLElement, e: MouseEvent): void {
    // The hovered element is `this`; alias it so it can be stashed into module
    // state (StyleDetectiveOverlay_element) for the console dump and freeze features to read.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const el = this;

    if (isInsidePanel(el)) return;

    // Suppress the element's native title tooltip while inspecting — it renders
    // in browser chrome, outside the page's stacking context, so no z-index can
    // keep our panel above it. Stash the value and restore it on mouseout.
    if (el.hasAttribute('title')) {
        el.setAttribute('data-styledetective-title', el.getAttribute('title') ?? '');
        el.removeAttribute('title');
    }

    // Block
    const document = GetCurrentDocument();
    const block = document.getElementById('StyleDetectiveOverlay');

    if (!block) {
        return;
    }

    if (block.firstChild) {
        (block.firstChild as HTMLElement).innerHTML =
            '&lt;' +
            el.tagName +
            '&gt;' +
            (el.id == '' ? '' : ' #' + el.id) +
            (el.className == '' ? '' : ' .' + el.className);
    }

    // Outline element
    if (el.tagName != 'body') {
        el.style.outline = '1px dashed #f00';
        StyleDetectiveOverlay_current_element = el;
    }

    // Updating CSS properties
    if (!document.defaultView) return;
    const element = document.defaultView.getComputedStyle(el, null);

    UpdatefontText(element);
    UpdateColorBg(element);
    UpdateBox(element);
    UpdatePositioning(element);
    UpdateTable(element, el.tagName);
    UpdateList(element, el.tagName);
    UpdateMisc(element);
    UpdateEffects(element);

    StyleDetectiveOverlay_element = el;

    styleDetectiveRemoveElement('styleDetectiveInsertMessage');

    e.stopPropagation();

    // generate simple css definition
    StyleDetectiveOverlay_element_cssDefinition =
        el.tagName.toLowerCase() +
        (el.id == '' ? '' : ' #' + el.id) +
        (el.className == '' ? '' : ' .' + el.className) +
        ' {\n';

    StyleDetectiveOverlay_element_cssDefinition += '\t/* Font & Text */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pFont);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Color & Background */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pColorBg);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Box */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pBox);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Positioning */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pPositioning);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* List */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pList);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Table */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pTable);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Miscellaneous */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pMisc);

    StyleDetectiveOverlay_element_cssDefinition += '\n\t/* Effects */\n';
    appendCssDefinition(element, StyleDetectiveOverlay_pEffect);

    StyleDetectiveOverlay_element_cssDefinition += '}';
}

function StyleDetectiveOverlayMouseOut(this: HTMLElement, e: MouseEvent): void {
    if (isInsidePanel(this)) return;

    this.style.outline = '';

    // Restore the native title we suppressed on mouseover.
    if (this.hasAttribute('data-styledetective-title')) {
        this.setAttribute('title', this.getAttribute('data-styledetective-title') ?? '');
        this.removeAttribute('data-styledetective-title');
    }

    e.stopPropagation();
}

function StyleDetectiveOverlayMouseMove(this: HTMLElement, e: MouseEvent): void {
    if (isInsidePanel(this)) return;

    const document = GetCurrentDocument();
    const block = document.getElementById('StyleDetectiveOverlay');

    if (!block) {
        return;
    }

    block.style.display = 'block';

    const pageWidth = window.innerWidth;
    // Keep the panel clear of the browser's link-URL preview, which the browser
    // draws in the bottom-left of the viewport when hovering a link. Reserve a
    // strip at the bottom so the panel never extends into it.
    const BOTTOM_MARGIN = 40;
    const pageHeight = window.innerHeight - BOTTOM_MARGIN;
    // Measure the actual rendered size — the panel grows wider than a fixed
    // width for long values, so a hardcoded width mispositions it near the edge.
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

    // adapt block top to screen offset
    const inView = StyleDetectiveOverlayIsElementInViewport(block);

    if (!inView) block.style.top = window.pageYOffset + 20 + 'px';

    e.stopPropagation();
}

// http://stackoverflow.com/a/7557433
function StyleDetectiveOverlayIsElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// === StyleDetectiveOverlay ===

class StyleDetectiveOverlay {
    // Whether all elements currently have the hover event listeners attached.
    haveEventListeners = false;

    // Create a block to display informations
    CreateBlock(): HTMLElement | undefined {
        const document = GetCurrentDocument();
        let block: HTMLDivElement | undefined;

        if (document) {
            // Create a div block
            block = document.createElement('div');
            block.id = 'StyleDetectiveOverlay';

            // Insert a title for CSS selector
            const header = document.createElement('h1');

            header.appendChild(document.createTextNode(''));
            block.appendChild(header);

            // Insert all properties
            const center = document.createElement('div');

            center.id = 'StyleDetectiveOverlay__center';

            for (const cat in StyleDetectiveOverlay_categories) {
                const div = document.createElement('div');

                div.id = 'StyleDetectiveOverlay__' + cat;
                div.className = 'StyleDetectiveOverlay__category';

                const h2 = document.createElement('h2');

                h2.appendChild(document.createTextNode(StyleDetectiveOverlay_categoriesTitle[cat]!));

                const ul = document.createElement('ul');
                const properties = StyleDetectiveOverlay_categories[cat]!;

                for (const property of properties) {
                    const li = document.createElement('li');

                    li.id = 'StyleDetectiveOverlay__' + property;

                    const spanName = document.createElement('span');

                    spanName.className = 'StyleDetectiveOverlay__property';

                    const spanValue = document.createElement('span');

                    spanName.appendChild(document.createTextNode(property));
                    li.appendChild(spanName);
                    li.appendChild(spanValue);
                    ul.appendChild(li);
                }

                div.appendChild(h2);
                div.appendChild(ul);
                center.appendChild(div);
            }

            block.appendChild(center);

            // Insert a footer
            const footer = document.createElement('div');

            footer.id = 'StyleDetectiveOverlay__footer';

            footer.appendChild(
                document.createTextNode(
                    'Style Detective 1.8.0. Keys: [F] Un/Freeze • [C] Copy • [Esc] Close',
                ),
            );
            block.appendChild(footer);
        }

        styleDetectiveInsertMessage(
            'Style Detective loaded! Hover any element you want to inspect in the page.',
        );

        return block;
    }

    // Get all elements within the given element
    GetAllElements(element: Node | null): HTMLElement[] {
        let elements: HTMLElement[] = [];

        if (element && element.hasChildNodes()) {
            elements.push(element as HTMLElement);

            const childs = element.childNodes;

            for (let i = 0; i < childs.length; i++) {
                const child = childs[i]!;
                if (child.hasChildNodes()) {
                    elements = elements.concat(this.GetAllElements(child));
                } else if (child.nodeType == 1) {
                    elements.push(child as HTMLElement);
                }
            }
        }

        return elements;
    }

    // Add event listeners for all elements in the current document
    AddEventListeners(): void {
        const document = GetCurrentDocument();
        const elements = this.GetAllElements(document.body);

        for (const element of elements) {
            element.addEventListener('mouseover', StyleDetectiveOverlayMouseOver, false);
            element.addEventListener('mouseout', StyleDetectiveOverlayMouseOut, false);
            element.addEventListener('mousemove', StyleDetectiveOverlayMouseMove, false);
        }
        this.haveEventListeners = true;
    }

    // Remove event listeners for all elements in the current document
    RemoveEventListeners(): void {
        const document = GetCurrentDocument();
        const elements = this.GetAllElements(document.body);

        for (const element of elements) {
            element.removeEventListener('mouseover', StyleDetectiveOverlayMouseOver, false);
            element.removeEventListener('mouseout', StyleDetectiveOverlayMouseOut, false);
            element.removeEventListener('mousemove', StyleDetectiveOverlayMouseMove, false);
        }
        this.haveEventListeners = false;
    }

    // Check whether StyleDetectiveOverlay is enabled
    IsEnabled(): boolean {
        const document = GetCurrentDocument();

        return document.getElementById('StyleDetectiveOverlay') != null;
    }

    // Enable StyleDetectiveOverlay
    Enable(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');

        if (!block) {
            const created = this.CreateBlock();
            if (created) document.body.appendChild(created);
            this.AddEventListeners();

            return true;
        }

        return false;
    }

    // Disable StyleDetectiveOverlay
    Disable(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');
        const insertMessage = document.getElementById('styleDetectiveInsertMessage');

        if (block || insertMessage) {
            if (block) document.body.removeChild(block);
            if (insertMessage) document.body.removeChild(insertMessage);
            this.RemoveEventListeners();

            // Restore any titles still suppressed because the viewer was disabled
            // while an element was hovered (mouseout never fired for it).
            for (const el of document.querySelectorAll('[data-styledetective-title]')) {
                el.setAttribute('title', el.getAttribute('data-styledetective-title') ?? '');
                el.removeAttribute('data-styledetective-title');
            }

            return true;
        }

        return false;
    }

    // Freeze StyleDetectiveOverlay
    Freeze(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');
        if (block && this.haveEventListeners) {
            this.RemoveEventListeners();

            return true;
        }

        return false;
    }

    // Unfreeze StyleDetectiveOverlay
    Unfreeze(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('StyleDetectiveOverlay');
        if (block && !this.haveEventListeners) {
            // Remove the red outline
            if (StyleDetectiveOverlay_current_element) StyleDetectiveOverlay_current_element.style.outline = '';
            this.AddEventListeners();

            return true;
        }

        return false;
    }
}

/*
* Display the notification message
*/
function styleDetectiveInsertMessage(msg: string): void {
    const oNewP = document.createElement('p');
    const oText = document.createTextNode(msg);

    oNewP.appendChild(oText);
    oNewP.id                    = 'styleDetectiveInsertMessage';
    oNewP.style.backgroundColor = '#b40000';
    oNewP.style.color           = '#ffffff';
    oNewP.style.position        = "fixed";
    oNewP.style.top             = '10px';
    oNewP.style.left            = '10px';
    oNewP.style.zIndex          = '9999';
    oNewP.style.padding         = '3px';

    document.body.appendChild(oNewP);
}

/*
* Removes an element from the DOM, used to remove the notification message.
*/
function styleDetectiveRemoveElement(divid: string): void {
    const n = document.getElementById(divid);

    if (n) {
        document.body.removeChild(n);
    }
}

/*
* Copy the current element's CSS to the console. Called by the service worker's
* context-menu handler (see globalThis assignment at the end of this file).
*/
function styleDetectiveCopyCssToConsole(type: string): void {
    if (!StyleDetectiveOverlay_element) return;
    const view = document.defaultView;

    if (type == 'el') console.log(StyleDetectiveOverlay_element);
    else if (type == 'id') console.log(StyleDetectiveOverlay_element.id);
    else if (type == 'tagName') console.log(StyleDetectiveOverlay_element.tagName);
    else if (type == 'className') console.log(StyleDetectiveOverlay_element.className);
    else if (type == 'style') console.log(StyleDetectiveOverlay_element.style);
    else if (type == 'cssText' && view)
        console.log(view.getComputedStyle(StyleDetectiveOverlay_element, null).cssText);
    else if (type == 'getComputedStyle' && view)
        console.log(view.getComputedStyle(StyleDetectiveOverlay_element, null));
    else if (type == 'simpleCssDefinition') console.log(StyleDetectiveOverlay_element_cssDefinition);
}

/*
*  Close the viewer on [Esc], freeze/unfreeze on [f], show CSS on [c].
*/
function CssViewerKeyMap(e: KeyboardEvent): void {
    if (!styleDetective.IsEnabled()) return;

    // ESC: Close the css viewer if the styleDetective is enabled.
    if (e.keyCode === 27) {
        // Remove the red outline
        if (StyleDetectiveOverlay_current_element) StyleDetectiveOverlay_current_element.style.outline = '';
        styleDetective.Disable();
    }

    if (e.altKey || e.ctrlKey) return;

    // f: Freeze or Unfreeze the css viewer if the styleDetective is enabled
    if (e.keyCode === 70) {
        if (styleDetective.haveEventListeners) {
            styleDetective.Freeze();
        } else {
            styleDetective.Unfreeze();
        }
    }

    // c: Show code css for selected element.
    // window.prompt should suffice for now.
    if (e.keyCode === 67) {
        window.prompt(
            'Simple Css Definition :\n\nYou may copy the code below then hit escape to continue.',
            StyleDetectiveOverlay_element_cssDefinition,
        );
    }
}


// Entry point: toggle the viewer on (re-)injection.
const styleDetective = new StyleDetectiveOverlay();

if (styleDetective.IsEnabled()) {
    styleDetective.Disable();
} else {
    styleDetective.Enable();
}

document.onkeydown = CssViewerKeyMap;

// The build wraps this file in an IIFE, so top-level functions no longer attach
// to the page's global scope automatically. The context-menu handler in the
// service worker injects a separate function that calls this by name, so expose
// it explicitly. It closes over the same StyleDetectiveOverlay_element that hovering updates.
globalThis.styleDetectiveCopyCssToConsole = styleDetectiveCopyCssToConsole;
