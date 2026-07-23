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

const CONTENT_CSS = 'src/content/style.css';
const CONTENT_JS = 'src/content/core.js';

// Toolbar icon / keyboard shortcut: inject style.css + core.js into
// the active tab. The content script toggles itself on/off on re-injection.
// removeCSS first so repeated toggles (or stylesheet updates) don't stack
// stale rules — e.g. an old float-based layout lingering beside the new flex one.
chrome.action.onClicked.addListener(function (tab) {
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
        return;
    }

    const target = { tabId: tab.id };

    void chrome.scripting
        .removeCSS({ target, files: [CONTENT_CSS] })
        .catch(function () {
            // No previously injected sheet — fine.
        })
        .finally(function () {
            void chrome.scripting.insertCSS({ target, files: [CONTENT_CSS] });
            void chrome.scripting.executeScript({ target, files: [CONTENT_JS] });
        });
});
