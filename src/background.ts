/*!
* Style Detective
*/

// Context-menu items that dump the current element to the page console. Each
// value is passed as the `type` argument to the page-side styleDetectiveCopyCssToConsole().
const CONTEXT_MENU_ITEMS = [
    { id: 'el', title: 'element' },
    { id: 'id', title: 'element.id' },
    { id: 'tagName', title: 'element.tagName' },
    { id: 'className', title: 'element.className' },
    { id: 'style', title: 'element.style' },
    { id: 'cssText', title: 'element.cssText' },
    { id: 'getComputedStyle', title: 'element.getComputedStyle' },
    { id: 'simpleCssDefinition', title: 'element.simpleCssDefinition' },
];

// Register the context menus and open the options page on install/update.
chrome.runtime.onInstalled.addListener(function (details) {
    chrome.contextMenus.removeAll(function () {
        const parent = chrome.contextMenus.create({
            id: 'styledetective-console',
            title: 'Style Detective console',
            contexts: ['all'],
        });

        CONTEXT_MENU_ITEMS.forEach(function (item) {
            chrome.contextMenus.create({
                id: item.id,
                parentId: parent,
                title: item.title,
                contexts: ['all'],
            });
        });
    });

    if (details.reason === 'install' || details.reason === 'update') {
        chrome.runtime.openOptionsPage();
    }
});

// Pages where injection is not allowed / not useful.
function isRestrictedUrl(url: string | undefined): boolean {
    return (
        !url ||
        url.indexOf('https://chrome.google.com') === 0 ||
        url.indexOf('https://chromewebstore.google.com') === 0 ||
        url.indexOf('chrome://') === 0 ||
        url.indexOf('edge://') === 0
    );
}

// Toolbar icon / keyboard shortcut: inject style.css + core.js into
// the active tab. The content script toggles itself on/off on re-injection.
chrome.action.onClicked.addListener(function (tab) {
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
        return;
    }

    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['src/content/style.css'],
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/core.js'],
    });
});

// Context-menu clicks: call the page-side helper that core.js defined in
// the isolated world. `func` injection replaces MV2's banned executeScript({code}).
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (!tab || !tab.id || info.menuItemId === 'styledetective-console') {
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // This function is serialized and runs in the page's isolated world, where
        // styleDetectiveCopyCssToConsole was defined by core.ts on a prior injection.
        func: function (type: string) {
            const fn = (globalThis as Record<string, unknown>).styleDetectiveCopyCssToConsole;
            if (typeof fn === 'function') {
                fn(type);
            } else {
                console.warn(
                    'Style Detective is not active on this page. Click the Style Detective icon first.',
                );
            }
        },
        args: [String(info.menuItemId)],
    });
});
