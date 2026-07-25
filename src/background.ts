/*!
 * Style Detective — service worker.
 *
 * The content script is declared in the manifest (all_frames) and stays dormant
 * in each frame. Toolbar / shortcut toggles a single per-tab "armed" flag and
 * broadcasts it so every frame stays in sync. Escape also disarms the whole tab
 * (not just the focused frame). A claim/yield broadcast keeps one visible pane.
 */

import { armedStorageKey, parseSessionArmed } from './shared/prefs';

const ACTION_TITLE_DEFAULT = 'Style Detective';
const ACTION_TITLE_ARMED = 'Style Detective is on — click to turn off';

const ACTION_ICON_DEFAULT: Record<string, string> = {
    '16': 'images/16.png',
    '32': 'images/32.png',
    '48': 'images/48.png',
};

const ACTION_ICON_ARMED: Record<string, string> = {
    '16': 'images/16-active.png',
    '32': 'images/32-active.png',
    '48': 'images/48-active.png',
};

/** Per-tab toolbar icon + tooltip so only the armed tab looks active. */
async function syncActionUi(tabId: number, armed: boolean): Promise<void> {
    try {
        await chrome.action.setIcon({
            tabId,
            path: armed ? ACTION_ICON_ARMED : ACTION_ICON_DEFAULT,
        });
        await chrome.action.setTitle({
            tabId,
            title: armed ? ACTION_TITLE_ARMED : ACTION_TITLE_DEFAULT,
        });
    } catch {
        // Tab may already be closed or restricted.
    }
}

async function getTabArmed(tabId: number): Promise<boolean> {
    const key = armedStorageKey(tabId);
    const stored = await chrome.storage.session.get(key);
    const raw = stored[key];
    const armed = parseSessionArmed(raw);
    // Heal non-boolean leftovers so session state stays clean.
    if (raw !== undefined && raw !== armed) {
        if (armed) await chrome.storage.session.set({ [key]: true });
        else await chrome.storage.session.remove(key);
    }
    return armed;
}

async function setTabArmed(tabId: number, armed: boolean): Promise<void> {
    const key = armedStorageKey(tabId);
    if (armed) {
        await chrome.storage.session.set({ [key]: true });
    } else {
        await chrome.storage.session.remove(key);
    }

    await syncActionUi(tabId, armed);

    await chrome.tabs.sendMessage(tabId, { type: 'setOverlayArmed', armed }).catch(() => {
        // No receivers during navigation / restricted frames.
    });
}

async function ensureContentScripts(tabId: number): Promise<void> {
    const entry = chrome.runtime.getManifest().content_scripts?.[0];
    const jsFiles = entry?.js ?? [];
    const cssFiles = entry?.css ?? [];
    if (jsFiles.length === 0) return;

    const inject = async (allFrames: boolean): Promise<void> => {
        const target: chrome.scripting.InjectionTarget = { tabId, allFrames };
        if (cssFiles.length > 0) {
            await chrome.scripting.insertCSS({ target, files: cssFiles }).catch(() => {});
        }
        await chrome.scripting.executeScript({ target, files: jsFiles });
    };

    try {
        await inject(true);
    } catch (err) {
        // Ad / sandboxed iframes can make allFrames injection fail on busy sites.
        console.warn('[Style Detective] allFrames inject failed, trying main frame', err);
        await inject(false);
    }
}

/** CRX loaders import the real content script async — wait until a frame answers. */
async function waitForOverlay(tabId: number, attempts = 40, delayMs = 50): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'pingOverlay' });
            return true;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    return false;
}

async function toggleOverlay(tabId: number): Promise<void> {
    let coldInject = false;

    try {
        await chrome.tabs.sendMessage(tabId, { type: 'pingOverlay' });
    } catch {
        await ensureContentScripts(tabId);
        coldInject = true;
    }

    if (!(await waitForOverlay(tabId))) {
        console.warn('[Style Detective] content script did not become ready');
        return;
    }

    // After a cold inject, session storage may still say "armed" from a prior
    // failed toggle (message raced the async loader). Always turn on so the
    // first successful click after inject is visible.
    if (coldInject) {
        await setTabArmed(tabId, true);
        return;
    }

    const currentlyArmed = await getTabArmed(tabId);
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
        void setTabArmed(tabId, false);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(armedStorageKey(tabId));
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
