/*!
 * Style Detective — service worker.
 *
 * The content script is declared in the manifest (all_frames) and stays dormant
 * in each frame. Toolbar / shortcut toggles a single per-tab "armed" flag and
 * broadcasts it so every frame stays in sync. Escape also disarms the whole tab
 * (not just the focused frame). A claim/yield broadcast keeps one visible pane.
 *
 * On restricted URLs (Web Store, chrome://, chrome-extension://, …) the action
 * shows a small popup instead of toggling — content scripts cannot run there.
 */

import {
    OPTIONS_REVISION,
    loadLastSeenOptionsRevision,
    saveLastSeenOptionsRevision,
    armedStorageKey,
    parseSessionArmed,
} from './shared/prefs';
import { MessageType, Messages, parseExtensionMessage } from './shared/messages';

const ACTION_TITLE_DEFAULT = 'Style Detective';
const ACTION_TITLE_ARMED = 'Style Detective is on — click to turn off';
const ACTION_TITLE_RESTRICTED = 'Style Detective — not available on this page';
const UNSUPPORTED_POPUP = 'unsupported.html';

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

/** Pages where the content script is not injected / not allowed to run. */
function isRestrictedUrl(url: string): boolean {
    return (
        url.startsWith('https://chrome.google.com') ||
        url.startsWith('https://chromewebstore.google.com') ||
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('devtools://')
    );
}

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

/**
 * Restricted tabs get a popup (message UI). Normal tabs clear the popup so
 * chrome.action.onClicked can toggle the overlay.
 *
 * When `url` is missing (common for chrome-extension:// without the `tabs`
 * permission), leave the tab's popup alone — callers like the options page
 * register explicitly.
 */
async function syncActionPopup(tabId: number, url: string | undefined): Promise<void> {
    if (!url) return;

    const restricted = isRestrictedUrl(url);
    try {
        await chrome.action.setPopup({
            tabId,
            popup: restricted ? UNSUPPORTED_POPUP : '',
        });
        if (restricted) {
            await chrome.action.setTitle({ tabId, title: ACTION_TITLE_RESTRICTED });
            await chrome.action.setIcon({ tabId, path: ACTION_ICON_DEFAULT });
        } else {
            // Leaving a restricted page — restore idle title (armed state is cleared on navigate).
            await chrome.action.setTitle({ tabId, title: ACTION_TITLE_DEFAULT });
        }
    } catch {
        // Tab may already be closed.
    }
}

/** Force the unsupported popup for this tab and open it on the current gesture. */
async function showUnsupportedForTab(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id == null) return;

    try {
        await chrome.action.setPopup({ tabId: tab.id, popup: UNSUPPORTED_POPUP });
        await chrome.action.setTitle({ tabId: tab.id, title: ACTION_TITLE_RESTRICTED });
        await chrome.action.setIcon({ tabId: tab.id, path: ACTION_ICON_DEFAULT });
        await chrome.action.openPopup(
            tab.windowId != null ? { windowId: tab.windowId } : undefined,
        );
    } catch (err) {
        console.warn('[Style Detective] openPopup failed, opening fallback window', err);
        await chrome.windows
            .create({
                url: chrome.runtime.getURL(UNSUPPORTED_POPUP),
                type: 'popup',
                width: 340,
                height: 280,
                focused: true,
            })
            .catch(() => {});
    }
}

async function syncActionPopupForTab(tabId: number): Promise<void> {
    try {
        const tab = await chrome.tabs.get(tabId);
        await syncActionPopup(tabId, tab.url);
    } catch {
        // Tab gone.
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

    await chrome.tabs.sendMessage(tabId, Messages.setOverlayArmed(armed)).catch(() => {
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
            await chrome.tabs.sendMessage(tabId, Messages.pingOverlay());
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
        await chrome.tabs.sendMessage(tabId, Messages.pingOverlay());
    } catch {
        await ensureContentScripts(tabId);
        coldInject = true;
    }

    if (!(await waitForOverlay(tabId))) {
        throw new Error('content script did not become ready');
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

/**
 * First install → always open Options (onboarding).
 * Updates → open only when OPTIONS_REVISION was bumped for new Settings UI.
 * First encounter of the revision system seeds storage without opening a tab.
 */
chrome.runtime.onInstalled.addListener((details) => {
    void (async () => {
        if (details.reason === 'install') {
            chrome.runtime.openOptionsPage();
            await saveLastSeenOptionsRevision(OPTIONS_REVISION);
            return;
        }

        if (details.reason !== 'update') return;

        const lastSeen = await loadLastSeenOptionsRevision();
        if (lastSeen == null) {
            // Existing installs before OPTIONS_REVISION — don't nag once.
            await saveLastSeenOptionsRevision(OPTIONS_REVISION);
            return;
        }

        if (OPTIONS_REVISION > lastSeen) {
            chrome.runtime.openOptionsPage();
            await saveLastSeenOptionsRevision(OPTIONS_REVISION);
        }
    })();
});

// Drop stale armed flags when the tab navigates or closes; keep popup in sync.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        void setTabArmed(tabId, false);
    }
    if (changeInfo.url || changeInfo.status === 'complete') {
        void syncActionPopup(tabId, tab.url ?? changeInfo.url);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    void syncActionPopupForTab(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(armedStorageKey(tabId));
});

chrome.runtime.onMessage.addListener((raw, sender) => {
    const message = parseExtensionMessage(raw);
    if (!message) return;

    if (message.type === MessageType.OpenOptions) {
        chrome.runtime.openOptionsPage();
        return;
    }

    // Options page (and similar) register so the toolbar shows unsupported.html
    // even when chrome.tabs omits chrome-extension:// URLs.
    if (message.type === MessageType.RegisterRestrictedTab) {
        const tabId = sender.tab?.id ?? message.tabId ?? null;
        const url =
            message.url ||
            sender.url ||
            sender.tab?.url ||
            'chrome-extension://restricted/';
        if (tabId != null) void syncActionPopup(tabId, url);
        return;
    }

    if (message.type === MessageType.DisarmOverlay) {
        const tabId = sender.tab?.id;
        if (tabId == null) return;
        void setTabArmed(tabId, false);
        return;
    }

    if (message.type === MessageType.OverlayClaim) {
        const tabId = sender.tab?.id;
        if (tabId == null) return;

        void chrome.tabs
            .sendMessage(tabId, Messages.overlayClaim(message.instanceId))
            .catch(() => {});
    }
});

chrome.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId == null) {
        return;
    }

    void (async () => {
        let url = tab.url;
        if (!url) {
            try {
                const fresh = await chrome.tabs.get(tabId);
                url = fresh.url;
            } catch {
                // Tab may be gone.
            }
        }

        if (url && isRestrictedUrl(url)) {
            await showUnsupportedForTab(tab);
            return;
        }

        try {
            await toggleOverlay(tabId);
        } catch (err) {
            console.warn('[Style Detective] toggle failed', err);
            // Injection is blocked on extension pages and other restricted surfaces.
            if (!url || isRestrictedUrl(url)) {
                await showUnsupportedForTab(tab);
            }
        }
    })();
});

// Align popup state for the active tab when the worker wakes.
void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (tab?.id != null) void syncActionPopup(tab.id, tab.url);
});
