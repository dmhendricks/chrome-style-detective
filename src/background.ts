/*!
 * Style Detective — service worker.
 *
 * The content script is declared in the manifest and stays dormant on each
 * page. The toolbar icon / keyboard shortcut sends a toggle message, and
 * falls back to scripting injection when the tab has no content script yet
 * (strict CSP pages, or tabs open before install/update).
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
function isRestrictedUrl(url: string): boolean {
    return (
        url.startsWith('https://chrome.google.com') ||
        url.startsWith('https://chromewebstore.google.com') ||
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('devtools://')
    );
}

async function toggleOverlay(tabId: number): Promise<void> {
    try {
        await chrome.tabs.sendMessage(tabId, { type: 'toggleOverlay' });
        return;
    } catch {
        // No receiver yet — inject from the declared content_scripts entry.
    }

    const entry = chrome.runtime.getManifest().content_scripts?.[0];
    const jsFiles = entry?.js ?? [];
    const cssFiles = entry?.css ?? [];
    if (jsFiles.length === 0) return;

    const target = { tabId };

    if (cssFiles.length > 0) {
        await chrome.scripting.insertCSS({ target, files: cssFiles });
    }
    await chrome.scripting.executeScript({ target, files: jsFiles });
    await chrome.tabs.sendMessage(tabId, { type: 'toggleOverlay' });
}

// Toolbar icon / keyboard shortcut: ask the dormant content script to toggle.
// tab.url may be omitted without host access — only skip when we know the URL
// is restricted.
chrome.action.onClicked.addListener((tab) => {
    if (!tab?.id) {
        return;
    }
    if (tab.url && isRestrictedUrl(tab.url)) {
        return;
    }

    void toggleOverlay(tab.id).catch((err) => {
        console.warn('[Style Detective] toggle failed', err);
    });
});
