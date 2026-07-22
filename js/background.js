/*!
* CSSViewer, A Google Chrome Extension for fellow web developers, web designers, and hobbyists.
*
* https://github.com/miled/cssviewer
* https://chrome.google.com/webstore/detail/cssviewer/ggfgijbpiheegefliciemofobhmofgce
*
* This source code is licensed under the GNU General Public License,
* Version 2. See the file COPYING for more details.
*/

// Context-menu items that dump the current element to the page console. Each
// value is passed as the `type` argument to the page-side cssViewerCopyCssToConsole().
var CONTEXT_MENU_ITEMS = [
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
        var parent = chrome.contextMenus.create({
            id: 'cssviewer-console',
            title: 'CSSViewer console',
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
function isRestrictedUrl(url) {
    return (
        !url ||
        url.indexOf('https://chrome.google.com') === 0 ||
        url.indexOf('https://chromewebstore.google.com') === 0 ||
        url.indexOf('chrome://') === 0 ||
        url.indexOf('edge://') === 0
    );
}

// Toolbar icon / keyboard shortcut: inject cssviewer.css + cssviewer.js into
// the active tab. The content script toggles itself on/off on re-injection.
chrome.action.onClicked.addListener(function (tab) {
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
        return;
    }

    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['css/cssviewer.css'],
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/cssviewer.js'],
    });
});

// Context-menu clicks: call the page-side helper that cssviewer.js defined in
// the isolated world. `func` injection replaces MV2's banned executeScript({code}).
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (!tab || !tab.id || info.menuItemId === 'cssviewer-console') {
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (type) {
            if (typeof cssViewerCopyCssToConsole === 'function') {
                cssViewerCopyCssToConsole(type);
            } else {
                console.warn('CSSViewer is not active on this page. Click the CSSViewer icon first.');
            }
        },
        args: [String(info.menuItemId)],
    });
});
