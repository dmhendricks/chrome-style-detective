/*!
* Style Detective
*/

// Open the options page on install/update.
chrome.runtime.onInstalled.addListener(function (details) {
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
