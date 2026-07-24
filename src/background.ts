/*!
 * Style Detective — service worker.
 *
 * The content script is declared in the manifest and stays dormant on each
 * page. The toolbar icon / keyboard shortcut only sends a toggle message.
 */

// Open the options page on install/update.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        chrome.runtime.openOptionsPage();
    }
});

// Content script shortcuts (e.g. H) ask the service worker to open options —
// openOptionsPage isn't available in content-script contexts.
chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'openOptions') {
        chrome.runtime.openOptionsPage();
    }
});

// Pages where the content script is not injected / not useful.
function isRestrictedUrl(url: string | undefined): boolean {
    return (
        !url ||
        url.startsWith('https://chrome.google.com') ||
        url.startsWith('https://chromewebstore.google.com') ||
        url.startsWith('chrome://') ||
        url.startsWith('edge://')
    );
}

// Toolbar icon / keyboard shortcut: ask the dormant content script to toggle.
chrome.action.onClicked.addListener((tab) => {
    if (!tab?.id || isRestrictedUrl(tab.url)) {
        return;
    }

    void chrome.tabs.sendMessage(tab.id, { type: 'toggleOverlay' }).catch(() => {
        // No content script in this tab yet (e.g. open before install/update) —
        // reload the page so the declared content_scripts entry can attach.
    });
});
