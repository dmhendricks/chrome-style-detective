/*!
* CSS Viewer Classic — Displays a floating panel of any hovered element's CSS properties.
*/

// === Globals ===

// The element currently being inspected, and its generated CSS text. Updated on
// every mouseover; read by the context-menu console dump and the [c] key prompt.
let CSSViewer_element: HTMLElement | null = null;
let CSSViewer_element_cssDefinition = '';
let CSSViewer_current_element: HTMLElement | null = null;

// CSS Properties
const CSSViewer_pFont = [
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

const CSSViewer_pColorBg = [
    'background-attachment',
    'background-color',
    'background-image',
    'background-position',
    'background-repeat',
    'color',
];

const CSSViewer_pBox = [
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

const CSSViewer_pPositioning = [
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

const CSSViewer_pList = ['list-style-image', 'list-style-type', 'list-style-position'];

const CSSViewer_pTable = [
    'border-collapse',
    'border-spacing',
    'caption-side',
    'empty-cells',
    'table-layout',
];

const CSSViewer_pMisc = ['overflow', 'cursor', 'visibility'];

const CSSViewer_pEffect = [
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
const CSSViewer_categories: Record<string, string[]> = {
    pFontText: CSSViewer_pFont,
    pColorBg: CSSViewer_pColorBg,
    pBox: CSSViewer_pBox,
    pPositioning: CSSViewer_pPositioning,
    pList: CSSViewer_pList,
    pTable: CSSViewer_pTable,
    pMisc: CSSViewer_pMisc,
    pEffect: CSSViewer_pEffect,
};

const CSSViewer_categoriesTitle: Record<string, string> = {
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
const CSSViewer_tableTagNames = [
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

const CSSViewer_listTagNames = ['UL', 'LI', 'DD', 'DT', 'OL'];

// Hexadecimal
const CSSViewer_hexa = [
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
];

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
    let nbHexa = '';

    nbHexa += CSSViewer_hexa[Math.floor(nb / 16)];
    nb = nb % 16;
    nbHexa += CSSViewer_hexa[nb];

    return nbHexa;
}

function RGBToHex(str: string): string {
    const start = str.search(/\(/) + 1;
    const end = str.search(/\)/);

    str = str.slice(start, end);

    const hexValues = str.split(', ');
    let hexStr = '#';

    for (let i = 0; i < hexValues.length; i++) {
        hexStr += DecToHex(Number(hexValues[i]));
    }

    if (hexStr == '#00000000') {
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
    const li = document.getElementById('CSSViewer_' + property);
    if (!li || !li.lastChild) return;

    (li.lastChild as HTMLElement).innerHTML = ' : ' + element.getPropertyValue(property);
}

function SetCSSPropertyIf(
    element: CSSStyleDeclaration,
    property: string,
    condition: boolean,
): number {
    const document = GetCurrentDocument();
    const li = document.getElementById('CSSViewer_' + property);
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
    const li = document.getElementById('CSSViewer_' + property);
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
    const li = document.getElementById('CSSViewer_' + property);
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
    const li = document.getElementById('CSSViewer_' + property);
    if (li) li.style.display = 'none';
}

function HideCSSCategory(category: string): void {
    const document = GetCurrentDocument();
    const div = document.getElementById('CSSViewer_' + category);
    if (div) div.style.display = 'none';
}

function ShowCSSCategory(category: string): void {
    const document = GetCurrentDocument();
    const div = document.getElementById('CSSViewer_' + category);
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
    if (IsInArray(CSSViewer_tableTagNames, tagName)) {
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
    if (IsInArray(CSSViewer_listTagNames, tagName)) {
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
        CSSViewer_element_cssDefinition +=
            '\t' + property + ': ' + element.getPropertyValue(property) + ';\n';
    }
}

function CSSViewerMouseOver(this: HTMLElement, e: MouseEvent): void {
    // The hovered element is `this`; alias it so it can be stashed into module
    // state (CSSViewer_element) for the console dump and freeze features to read.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const el = this;

    // Block
    const document = GetCurrentDocument();
    const block = document.getElementById('CSSViewer_block');

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
        CSSViewer_current_element = el;
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

    CSSViewer_element = el;

    cssViewerRemoveElement('cssViewerInsertMessage');

    e.stopPropagation();

    // generate simple css definition
    CSSViewer_element_cssDefinition =
        el.tagName.toLowerCase() +
        (el.id == '' ? '' : ' #' + el.id) +
        (el.className == '' ? '' : ' .' + el.className) +
        ' {\n';

    CSSViewer_element_cssDefinition += '\t/* Font & Text */\n';
    appendCssDefinition(element, CSSViewer_pFont);

    CSSViewer_element_cssDefinition += '\n\t/* Color & Background */\n';
    appendCssDefinition(element, CSSViewer_pColorBg);

    CSSViewer_element_cssDefinition += '\n\t/* Box */\n';
    appendCssDefinition(element, CSSViewer_pBox);

    CSSViewer_element_cssDefinition += '\n\t/* Positioning */\n';
    appendCssDefinition(element, CSSViewer_pPositioning);

    CSSViewer_element_cssDefinition += '\n\t/* List */\n';
    appendCssDefinition(element, CSSViewer_pList);

    CSSViewer_element_cssDefinition += '\n\t/* Table */\n';
    appendCssDefinition(element, CSSViewer_pTable);

    CSSViewer_element_cssDefinition += '\n\t/* Miscellaneous */\n';
    appendCssDefinition(element, CSSViewer_pMisc);

    CSSViewer_element_cssDefinition += '\n\t/* Effects */\n';
    appendCssDefinition(element, CSSViewer_pEffect);

    CSSViewer_element_cssDefinition += '}';
}

function CSSViewerMouseOut(this: HTMLElement, e: MouseEvent): void {
    this.style.outline = '';

    e.stopPropagation();
}

function CSSViewerMouseMove(this: HTMLElement, e: MouseEvent): void {
    const document = GetCurrentDocument();
    const block = document.getElementById('CSSViewer_block');

    if (!block || !document.defaultView) {
        return;
    }

    block.style.display = 'block';

    const pageWidth = window.innerWidth;
    const pageHeight = window.innerHeight;
    const blockWidth = 332;
    const blockHeightStr = document.defaultView
        .getComputedStyle(block, null)
        .getPropertyValue('height');

    const blockHeight = Number(blockHeightStr.substr(0, blockHeightStr.length - 2));

    if (e.pageX + blockWidth > pageWidth) {
        if (e.pageX - blockWidth - 10 > 0) block.style.left = e.pageX - blockWidth - 40 + 'px';
        else block.style.left = 0 + 'px';
    } else block.style.left = e.pageX + 20 + 'px';

    if (e.pageY + blockHeight > pageHeight) {
        if (e.pageY - blockHeight - 10 > 0) block.style.top = e.pageY - blockHeight - 20 + 'px';
        else block.style.top = 0 + 'px';
    } else block.style.top = e.pageY + 20 + 'px';

    // adapt block top to screen offset
    const inView = CSSViewerIsElementInViewport(block);

    if (!inView) block.style.top = window.pageYOffset + 20 + 'px';

    e.stopPropagation();
}

// http://stackoverflow.com/a/7557433
function CSSViewerIsElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// === CSSViewer ===

class CSSViewer {
    // Whether all elements currently have the hover event listeners attached.
    haveEventListeners = false;

    // Create a block to display informations
    CreateBlock(): HTMLElement | undefined {
        const document = GetCurrentDocument();
        let block: HTMLDivElement | undefined;

        if (document) {
            // Create a div block
            block = document.createElement('div');
            block.id = 'CSSViewer_block';

            // Insert a title for CSS selector
            const header = document.createElement('h1');

            header.appendChild(document.createTextNode(''));
            block.appendChild(header);

            // Insert all properties
            const center = document.createElement('div');

            center.id = 'CSSViewer_center';

            for (const cat in CSSViewer_categories) {
                const div = document.createElement('div');

                div.id = 'CSSViewer_' + cat;
                div.className = 'CSSViewer_category';

                const h2 = document.createElement('h2');

                h2.appendChild(document.createTextNode(CSSViewer_categoriesTitle[cat]!));

                const ul = document.createElement('ul');
                const properties = CSSViewer_categories[cat]!;

                for (const property of properties) {
                    const li = document.createElement('li');

                    li.id = 'CSSViewer_' + property;

                    const spanName = document.createElement('span');

                    spanName.className = 'CSSViewer_property';

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

            footer.id = 'CSSViewer_footer';

            footer.appendChild(
                document.createTextNode(
                    'CSS Viewer Classic 1.8.0. keys: [F] Un/Freeze &bull; [C] Copy &bull; [Esc] Close',
                ),
            );
            block.appendChild(footer);
        }

        cssViewerInsertMessage(
            'CSS Viewer Classic loaded! Hover any element you want to inspect in the page.',
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
            element.addEventListener('mouseover', CSSViewerMouseOver, false);
            element.addEventListener('mouseout', CSSViewerMouseOut, false);
            element.addEventListener('mousemove', CSSViewerMouseMove, false);
        }
        this.haveEventListeners = true;
    }

    // Remove event listeners for all elements in the current document
    RemoveEventListeners(): void {
        const document = GetCurrentDocument();
        const elements = this.GetAllElements(document.body);

        for (const element of elements) {
            element.removeEventListener('mouseover', CSSViewerMouseOver, false);
            element.removeEventListener('mouseout', CSSViewerMouseOut, false);
            element.removeEventListener('mousemove', CSSViewerMouseMove, false);
        }
        this.haveEventListeners = false;
    }

    // Check whether CSSViewer is enabled
    IsEnabled(): boolean {
        const document = GetCurrentDocument();

        return document.getElementById('CSSViewer_block') != null;
    }

    // Enable CSSViewer
    Enable(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('CSSViewer_block');

        if (!block) {
            const created = this.CreateBlock();
            if (created) document.body.appendChild(created);
            this.AddEventListeners();

            return true;
        }

        return false;
    }

    // Disable CSSViewer
    Disable(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('CSSViewer_block');
        const insertMessage = document.getElementById('cssViewerInsertMessage');

        if (block || insertMessage) {
            if (block) document.body.removeChild(block);
            if (insertMessage) document.body.removeChild(insertMessage);
            this.RemoveEventListeners();

            return true;
        }

        return false;
    }

    // Freeze CSSViewer
    Freeze(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('CSSViewer_block');
        if (block && this.haveEventListeners) {
            this.RemoveEventListeners();

            return true;
        }

        return false;
    }

    // Unfreeze CSSViewer
    Unfreeze(): boolean {
        const document = GetCurrentDocument();
        const block = document.getElementById('CSSViewer_block');
        if (block && !this.haveEventListeners) {
            // Remove the red outline
            if (CSSViewer_current_element) CSSViewer_current_element.style.outline = '';
            this.AddEventListeners();

            return true;
        }

        return false;
    }
}

/*
* Display the notification message
*/
function cssViewerInsertMessage(msg: string): void {
    const oNewP = document.createElement('p');
    const oText = document.createTextNode(msg);

    oNewP.appendChild(oText);
    oNewP.id                    = 'cssViewerInsertMessage';
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
function cssViewerRemoveElement(divid: string): void {
    const n = document.getElementById(divid);

    if (n) {
        document.body.removeChild(n);
    }
}

/*
* Copy the current element's CSS to the console. Called by the service worker's
* context-menu handler (see globalThis assignment at the end of this file).
*/
function cssViewerCopyCssToConsole(type: string): void {
    if (!CSSViewer_element) return;
    const view = document.defaultView;

    if (type == 'el') console.log(CSSViewer_element);
    else if (type == 'id') console.log(CSSViewer_element.id);
    else if (type == 'tagName') console.log(CSSViewer_element.tagName);
    else if (type == 'className') console.log(CSSViewer_element.className);
    else if (type == 'style') console.log(CSSViewer_element.style);
    else if (type == 'cssText' && view)
        console.log(view.getComputedStyle(CSSViewer_element, null).cssText);
    else if (type == 'getComputedStyle' && view)
        console.log(view.getComputedStyle(CSSViewer_element, null));
    else if (type == 'simpleCssDefinition') console.log(CSSViewer_element_cssDefinition);
}

/*
*  Close the viewer on [Esc], freeze/unfreeze on [f], show CSS on [c].
*/
function CssViewerKeyMap(e: KeyboardEvent): void {
    if (!cssViewer.IsEnabled()) return;

    // ESC: Close the css viewer if the cssViewer is enabled.
    if (e.keyCode === 27) {
        // Remove the red outline
        if (CSSViewer_current_element) CSSViewer_current_element.style.outline = '';
        cssViewer.Disable();
    }

    if (e.altKey || e.ctrlKey) return;

    // f: Freeze or Unfreeze the css viewer if the cssViewer is enabled
    if (e.keyCode === 70) {
        if (cssViewer.haveEventListeners) {
            cssViewer.Freeze();
        } else {
            cssViewer.Unfreeze();
        }
    }

    // c: Show code css for selected element.
    // window.prompt should suffice for now.
    if (e.keyCode === 67) {
        window.prompt(
            'Simple Css Definition :\n\nYou may copy the code below then hit escape to continue.',
            CSSViewer_element_cssDefinition,
        );
    }
}


// Entry point: toggle the viewer on (re-)injection.
const cssViewer = new CSSViewer();

if (cssViewer.IsEnabled()) {
    cssViewer.Disable();
} else {
    cssViewer.Enable();
}

document.onkeydown = CssViewerKeyMap;

// The build wraps this file in an IIFE, so top-level functions no longer attach
// to the page's global scope automatically. The context-menu handler in the
// service worker injects a separate function that calls this by name, so expose
// it explicitly. It closes over the same CSSViewer_element that hovering updates.
globalThis.cssViewerCopyCssToConsole = cssViewerCopyCssToConsole;
