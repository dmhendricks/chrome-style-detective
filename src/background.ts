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
const OPTIONS_PAGE_PATH = 'src/options/options.html';

/**
 * `openOptionsPage()` cannot take a hash. Open (or focus) Options at `#guide`
 * or `#settings` so callers can land on the right tab.
 * Pass `highlightUpdate` on install / OPTIONS_REVISION bumps so the page can
 * show "New" affordances (`?update=true`); omit for S / manual opens.
 */
async function openOptionsAt(
    tab: 'guide' | 'settings',
    options: { highlightUpdate?: boolean } = {},
): Promise<void> {
    const base = chrome.runtime.getURL(OPTIONS_PAGE_PATH);
    const target = options.highlightUpdate
        ? `${base}?update=true#${tab}`
        : `${base}#${tab}`;
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url?.startsWith(base));

    if (existing?.id != null) {
        await chrome.tabs.update(existing.id, { url: target, active: true });
        if (existing.windowId != null) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
        return;
    }

    await chrome.tabs.create({ url: target });
}

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

/**
 * Edge (and sometimes Chrome) can log "Unchecked runtime.lastError: No tab with id"
 * when a tab closes mid-flight, even if the Promise form is awaited/caught.
 * Prefer callbacks and always read lastError so Manage Extensions stays quiet.
 */
function runTabCallback(run: (done: () => void) => void): Promise<boolean> {
    return new Promise((resolve) => {
        run(() => {
            resolve(chrome.runtime.lastError == null);
        });
    });
}

function setTabIcon(tabId: number, path: Record<string, string>): Promise<boolean> {
    return runTabCallback((done) => {
        chrome.action.setIcon({ tabId, path }, done);
    });
}

function setTabTitle(tabId: number, title: string): Promise<boolean> {
    return runTabCallback((done) => {
        chrome.action.setTitle({ tabId, title }, done);
    });
}

function setTabPopup(tabId: number, popup: string): Promise<boolean> {
    return runTabCallback((done) => {
        chrome.action.setPopup({ tabId, popup }, done);
    });
}

function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                resolve(undefined);
                return;
            }
            resolve(tab);
        });
    });
}

function sendTabMessage(
    tabId: number,
    message: unknown,
    options?: { frameId?: number },
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, options ?? {}, (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
                reject(new Error(err.message));
                return;
            }
            resolve(response);
        });
    });
}

/** Broadcast to every frame; do not wait on a response (avoids multi-frame stalls). */
function broadcastTabMessage(tabId: number, message: unknown): void {
    chrome.tabs.sendMessage(tabId, message, () => {
        void chrome.runtime.lastError;
    });
}

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
    const ok = await setTabIcon(tabId, armed ? ACTION_ICON_ARMED : ACTION_ICON_DEFAULT);
    if (!ok) return;
    await setTabTitle(tabId, armed ? ACTION_TITLE_ARMED : ACTION_TITLE_DEFAULT);
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
    const ok = await setTabPopup(tabId, restricted ? UNSUPPORTED_POPUP : '');
    if (!ok) return;

    if (restricted) {
        await setTabTitle(tabId, ACTION_TITLE_RESTRICTED);
        await setTabIcon(tabId, ACTION_ICON_DEFAULT);
    } else {
        // Leaving a restricted page — restore idle title (armed state is cleared on navigate).
        await setTabTitle(tabId, ACTION_TITLE_DEFAULT);
    }
}

/** Force the unsupported popup for this tab and open it on the current gesture. */
async function showUnsupportedForTab(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id == null) return;
    const tabId = tab.id;

    // Tab may have closed between click and here — don't open a fallback window then.
    if (!(await setTabPopup(tabId, UNSUPPORTED_POPUP))) return;
    await setTabTitle(tabId, ACTION_TITLE_RESTRICTED);
    await setTabIcon(tabId, ACTION_ICON_DEFAULT);

    try {
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
    const tab = await getTab(tabId);
    if (!tab) return;
    await syncActionPopup(tabId, tab.url);
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

    // Icon/title and frame broadcast can run in parallel — neither should block
    // the other, and the broadcast must not wait for every iframe to reply.
    void syncActionUi(tabId, armed);
    broadcastTabMessage(tabId, Messages.setOverlayArmed(armed));
}

async function ensureContentScripts(tabId: number): Promise<void> {
    const entry = chrome.runtime.getManifest().content_scripts?.[0];
    const jsFiles = entry?.js ?? [];
    const cssFiles = entry?.css ?? [];
    if (jsFiles.length === 0) return;

    const inject = async (allFrames: boolean): Promise<void> => {
        const target: chrome.scripting.InjectionTarget = { tabId, allFrames };
        if (cssFiles.length > 0) {
            // CSS failure is non-fatal (same as before) — still try JS.
            await runTabCallback((done) => {
                chrome.scripting.insertCSS({ target, files: cssFiles }, done);
            });
        }
        const errMessage = await new Promise<string | null>((resolve) => {
            chrome.scripting.executeScript({ target, files: jsFiles }, () => {
                resolve(chrome.runtime.lastError?.message ?? null);
            });
        });
        if (errMessage) throw new Error(errMessage);
    };

    // Main frame first so toggle isn't blocked by ad/sandbox iframe injection.
    await inject(false);

    // Best-effort iframe coverage in the background — don't await.
    void inject(true).catch((err) => {
        console.warn('[Style Detective] allFrames inject failed', err);
    });
}

/** CRX loaders import the real content script async — wait until the top frame answers. */
async function waitForOverlay(tabId: number, attempts = 40, delayMs = 50): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        try {
            // Prefer the top frame so a hung ad iframe can't stall readiness.
            await sendTabMessage(tabId, Messages.pingOverlay(), { frameId: 0 });
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
        await sendTabMessage(tabId, Messages.pingOverlay(), { frameId: 0 });
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
 * First install → open Options on Guide (onboarding).
 * Updates → open Settings only when OPTIONS_REVISION was bumped for new UI.
 * First encounter of the revision system seeds storage without opening a tab.
 */
chrome.runtime.onInstalled.addListener((details) => {
    void (async () => {
        if (details.reason === 'install') {
            await openOptionsAt('guide', { highlightUpdate: true });
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
            await openOptionsAt('settings', { highlightUpdate: true });
            await saveLastSeenOptionsRevision(OPTIONS_REVISION);
        }
    })();
});

// Drop stale armed flags on real navigations only. A bare status==="loading"
// also fires for prerender / some subframe churn and was disarming the overlay
// right after a successful toggle (flash open → closed).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
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
        void openOptionsAt('settings');
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

        void broadcastTabMessage(tabId, Messages.overlayClaim(message.instanceId));
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
            const fresh = await getTab(tabId);
            url = fresh?.url;
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
chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const tab = tabs[0];
    if (tab?.id != null) void syncActionPopup(tab.id, tab.url);
});
