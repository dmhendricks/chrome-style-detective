/*!
 * Style Detective — service worker.
 *
 * The content script is declared in the manifest (all_frames) and stays dormant
 * in each frame. Toolbar / shortcut toggles a single per-tab "armed" flag and
 * broadcasts it so every frame stays in sync. Escape also disarms the whole tab
 * (not just the focused frame). A claim/yield broadcast keeps one visible pane.
 */

const ARMED_KEY_PREFIX = 'sdArmed:';

function armedKey(tabId: number): string {
    return `${ARMED_KEY_PREFIX}${tabId}`;
}

async function getTabArmed(tabId: number): Promise<boolean> {
    const key = armedKey(tabId);
    const stored = await chrome.storage.session.get(key);
    return stored[key] === true;
}

async function setTabArmed(tabId: number, armed: boolean): Promise<void> {
    const key = armedKey(tabId);
    if (armed) {
        await chrome.storage.session.set({ [key]: true });
    } else {
        await chrome.storage.session.remove(key);
    }

    await chrome.tabs.sendMessage(tabId, { type: 'setOverlayArmed', armed }).catch(() => {
        // No receivers during navigation / restricted frames.
    });
}

async function ensureContentScripts(tabId: number): Promise<void> {
    const entry = chrome.runtime.getManifest().content_scripts?.[0];
    const jsFiles = entry?.js ?? [];
    const cssFiles = entry?.css ?? [];
    if (jsFiles.length === 0) return;

    const target: chrome.scripting.InjectionTarget = { tabId, allFrames: true };

    if (cssFiles.length > 0) {
        await chrome.scripting.insertCSS({ target, files: cssFiles }).catch(() => {});
    }
    await chrome.scripting.executeScript({ target, files: jsFiles });
}

async function toggleOverlay(tabId: number): Promise<void> {
    let injected = false;

    try {
        // Probe: throws when no frame has a listener yet.
        await chrome.tabs.sendMessage(tabId, { type: 'pingOverlay' });
    } catch {
        await ensureContentScripts(tabId);
        injected = true;
    }

    const currentlyArmed = injected ? false : await getTabArmed(tabId);
    await setTabArmed(tabId, !currentlyArmed);
}

// Open the options page on install/update.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        chrome.runtime.openOptionsPage();
    }
});

// Drop stale armed flags when the tab navigates or closes.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        void chrome.storage.session.remove(armedKey(tabId));
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(armedKey(tabId));
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'openOptions') {
        chrome.runtime.openOptionsPage();
        return;
    }

    if (message?.type === 'disarmOverlay') {
        const tabId = sender.tab?.id;
        if (tabId == null) return;
        void setTabArmed(tabId, false);
        return;
    }

    if (message?.type === 'overlayClaim' && typeof message.instanceId === 'string') {
        const tabId = sender.tab?.id;
        if (tabId == null) return;

        void chrome.tabs
            .sendMessage(tabId, {
                type: 'overlayClaim',
                instanceId: message.instanceId,
            })
            .catch(() => {});
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
