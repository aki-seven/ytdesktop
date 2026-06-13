import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { app, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import log from "electron-log";

const createBlockerFromPrebuilt = async (fetchImpl: typeof fetch): Promise<ElectronBlocker> => {
    // Using any to bypass incorrect type definitions
    return (ElectronBlocker as any).fromPrebuiltAdsAndTracking(fetchImpl);
};

const deserializeBlocker = (data: Uint8Array): ElectronBlocker => {
    return (ElectronBlocker as any).deserialize(data);
};

const serializeBlocker = (blocker: ElectronBlocker): Uint8Array => {
    return (blocker as any).serialize();
};

let blocker: ElectronBlocker | null = null;
let blockerInitialized = false;
let updateInterval: NodeJS.Timeout | null = null;
let currentSession: Electron.Session | null = null;

const CACHE_PATH = path.join(app.getPath("userData"), "adblock.bin");
const UPDATE_INTERVAL_MS = 1000 * 60 * 60 * 6;

async function saveBlockerToCache(blockerInstance: ElectronBlocker): Promise<void> {
    const serialized = serializeBlocker(blockerInstance);
    await fs.writeFile(CACHE_PATH, Buffer.from(serialized));
}

export async function initializeAdblocker(): Promise<void> {
    if (blockerInitialized) {
        log.info("[Adblock] Already initialized, skipping");
        return;
    }

    log.info("[Adblock] Initializing ad blocker...");

    try {
        const ses = session.fromPartition(
            app.isPackaged ? "persist:ytview" : "persist:ytview-dev"
        );
        currentSession = ses;

        if (fs.existsSync(CACHE_PATH)) {
            log.info("[Adblock] Loading cached engine from disk");
            const cachedData = await fs.readFile(CACHE_PATH);
            blocker = deserializeBlocker(new Uint8Array(cachedData));
        } else {
            log.info("[Adblock] Downloading prebuilt filters (first run)");
            blocker = await createBlockerFromPrebuilt(fetch);
            await saveBlockerToCache(blocker);
            log.info("[Adblock] Filters cached to disk");
        }

        blocker.enableBlockingInSession(ses);
        blockerInitialized = true;

        scheduleFilterUpdate(ses);

        log.info("[Adblock] Successfully initialized");
    } catch (error) {
        log.error("[Adblock] Failed to initialize:", error);
    }
}

export function setAdBlockingEnabled(enabled: boolean): void {
    if (!blocker || !currentSession || !blockerInitialized) {
        log.warn("[Adblock] Cannot toggle - not initialized");
        return;
    }

    if (enabled) {
        blocker.enableBlockingInSession(currentSession);
        log.info("[Adblock] Blocking enabled");
    } else {
        blocker.disableBlockingInSession(currentSession);
        log.info("[Adblock] Blocking disabled");
    }
}

function scheduleFilterUpdate(ses: Electron.Session): void {
    if (updateInterval) {
        clearInterval(updateInterval);
    }

    updateInterval = setInterval(async () => {
        if (blocker) {
            try {
                log.info("[Adblock] Updating filter lists...");
                blocker = await createBlockerFromPrebuilt(fetch);
                blocker.enableBlockingInSession(ses);
                await saveBlockerToCache(blocker);
                log.info("[Adblock] Filters updated and cached");
            } catch (error) {
                log.error("[Adblock] Failed to update filters:", error);
            }
        }
    }, UPDATE_INTERVAL_MS);
}

export async function injectYouTubeAdHiding(webContents: Electron.WebContents): Promise<void> {
    const youTubeAdCleaningScript = `
        (() => {
            if (window.__ytAdBlockingInjected) return;
            window.__ytAdBlockingInjected = true;

            const cleanAdObject = (obj) => {
                if (!obj) return obj;

                if (Array.isArray(obj.adPlacements)) {
                    obj.adPlacements = [];
                }
                if (Array.isArray(obj.playerAds)) {
                    obj.playerAds = [];
                }
                if (Array.isArray(obj.adSlots)) {
                    obj.adSlots = [];
                }
                if (obj.adBreakInterceptor) {
                    obj.adBreakInterceptor = null;
                }

                return obj;
            };

            if (window.ytInitialPlayerResponse) {
                const clean = cleanAdObject(window.ytInitialPlayerResponse);
                Object.defineProperty(window, 'ytInitialPlayerResponse', {
                    configurable: true,
                    get: () => clean,
                    set: (value) => {
                        Object.defineProperty(window, 'ytInitialPlayerResponse', {
                            configurable: true,
                            get: () => cleanAdObject(value),
                            set: (v) => { window.ytInitialPlayerResponse = cleanAdObject(v); }
                        });
                    }
                });
            }

            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch.apply(this, args);
                if (args[0] && typeof args[0] === 'string' && args[0].includes('youtube.com/api')) {
                    const originalJson = response.json.bind(response);
                    response.json = async () => {
                        try {
                            const data = await originalJson();
                            return cleanAdObject(data);
                        } catch (e) {
                            return {};
                        }
                    };
                }
                return response;
            };

            const observer = new MutationObserver(() => {
                document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-text-overlay, .video-ads, ytm-ad-slot-renderer, ytm-ad-skip-button-renderer, ytm-instream-ad-slot-renderer').forEach(el => {
                    el.remove();
                });
            });

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    observer.observe(document.body, { childList: true, subtree: true });
                });
            }

            window.addEventListener('load', () => {
                setInterval(() => {
                    document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-text-overlay, .video-ads, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, [class*="ad-showing"], ytm-ad-slot-renderer, ytm-ad-skip-button-renderer, ytm-instream-ad-slot-renderer').forEach(el => {
                        el.remove();
                    });
                }, 500);
            });
        })();
    `;

    try {
        await webContents.executeJavaScript(youTubeAdCleaningScript);
        log.info("[Adblock] YouTube ad hiding injected");
    } catch (error) {
        log.error("[Adblock] Failed to inject YouTube ad hiding:", error);
    }
}

export async function injectYouTubeAutoSkip(webContents: Electron.WebContents): Promise<void> {
    const autoSkipScript = `
        (() => {
            if (window.__ytAutoSkipInjected) return;
            window.__ytAutoSkipInjected = true;

            const SKIP_SELECTORS = [
                '.ytp-ad-skip-button-modern',
                '.ytp-ad-skip-button',
                '.ytp-skip-ad-button',
                '.videoAdUiSkipButton',
                'button.ytp-ad-skip-button'
            ];

            let lastSkipTime = 0;
            let originalVolume = null;
            let originalPlaybackRate = null;
            let recoveryActive = false;
            const SKIP_COOLDOWN_MS = 2000;
            const POLL_INTERVAL_MS = 500;

            const getPlayer = () => document.querySelector('.html5-video-player');
            const getVideo = () => getPlayer()?.querySelector('video');

            const findSkipButton = () => {
                const player = getPlayer();
                if (!player) return null;
                for (const sel of SKIP_SELECTORS) {
                    const btn = player.querySelector(sel);
                    if (btn) return btn;
                }
                return null;
            };

            const isButtonReady = (btn) => {
                const style = window.getComputedStyle(btn);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
                return true;
            };

            const restorePlayback = () => {
                if (!recoveryActive) return;
                const video = getVideo();
                if (video) {
                    if (originalVolume !== null) video.volume = originalVolume;
                    if (originalPlaybackRate !== null) video.playbackRate = originalPlaybackRate;
                }
                originalVolume = null;
                originalPlaybackRate = null;
                recoveryActive = false;
            };

            const activateRecovery = () => {
                const video = getVideo();
                if (!video || recoveryActive) return;
                originalVolume = video.volume;
                originalPlaybackRate = video.playbackRate;
                video.volume = 0;
                video.playbackRate = 8;
                recoveryActive = true;
            };

            const trySkip = () => {
                const now = Date.now();
                if (now - lastSkipTime < SKIP_COOLDOWN_MS) return;

                const player = getPlayer();
                const btn = findSkipButton();

                if (player) {
                    const isAdShowing = player.classList.contains('ad-showing');
                    if (isAdShowing && !btn) {
                        activateRecovery();
                    } else if (!isAdShowing && recoveryActive) {
                        restorePlayback();
                    }
                }

                if (btn && isButtonReady(btn)) {
                    lastSkipTime = now;
                    btn.click();
                    restorePlayback();
                }
            };

            const observer = new MutationObserver(() => trySkip());

            const setupObserver = () => {
                const player = getPlayer();
                if (player) {
                    observer.observe(player, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['class', 'style', 'disabled', 'aria-disabled']
                    });
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupObserver);
            } else {
                setupObserver();
            }

            setInterval(trySkip, POLL_INTERVAL_MS);

            document.addEventListener('yt-navigate-start', () => {
                lastSkipTime = 0;
                restorePlayback();
            });

            window.addEventListener('beforeunload', () => {
                observer.disconnect();
            });

            console.log('[AutoSkip] Initialized');
        })();
    `;

    try {
        await webContents.executeJavaScript(autoSkipScript);
        log.info("[Adblock] Auto-skip injected");
    } catch (error) {
        log.error("[Adblock] Failed to inject auto-skip:", error);
    }
}

export function isAdBlockerInitialized(): boolean {
    return blockerInitialized;
}