import { FiltersEngine, Request } from "@ghostery/adblocker";
import { app, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import log from "electron-log";

function fromElectronDetails(details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails): Request {
  const { id, url, resourceType, referrer, webContentsId } = details;
  return Request.fromRawDetails(
    webContentsId
      ? { _originalRequestDetails: details, requestId: `${id}`, sourceUrl: referrer, tabId: webContentsId, type: resourceType || "other", url }
      : { _originalRequestDetails: details, requestId: `${id}`, sourceUrl: referrer, type: resourceType || "other", url }
  );
}

let engine: FiltersEngine | null = null;
let blockerInitialized = false;
let updateInterval: NodeJS.Timeout | null = null;
let currentSession: Electron.Session | null = null;

const CACHE_PATH = path.join(app.getPath("userData"), "adblock.bin");
const UPDATE_INTERVAL_MS = 1000 * 60 * 60 * 6;

async function saveEngineToCache(engineInstance: FiltersEngine): Promise<void> {
  const serialized = engineInstance.serialize();
  await fs.writeFile(CACHE_PATH, Buffer.from(serialized));
}

function onBeforeRequest(details: Electron.OnBeforeRequestListenerDetails, callback: (response: Electron.Response) => void): void {
  if (!engine) {
    callback({});
    return;
  }
  const request = fromElectronDetails(details);
  if (engine.config.guessRequestTypeFromUrl === true && request.type === "other") {
    request.guessTypeOfRequest();
  }
  if (request.isMainFrame()) {
    callback({});
    return;
  }
  const { redirect, match } = engine.match(request);
  if (redirect) {
    callback({ redirectURL: redirect.dataUrl });
  } else if (match) {
    callback({ cancel: true });
  } else {
    callback({});
  }
}

function onHeadersReceived(details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void): void {
  if (!engine) {
    callback({ responseHeaders: details.responseHeaders });
    return;
  }
  const CSP_HEADER_NAME = "content-security-policy";
  const responseHeaders = details.responseHeaders || {};
  if (details.resourceType === "mainFrame" || details.resourceType === "subFrame") {
    const rawCSP = engine.getCSPDirectives(fromElectronDetails(details));
    if (rawCSP !== undefined) {
      const policies = rawCSP.split(";").map((c: string) => c.trim());
      for (const [name, values] of Object.entries(responseHeaders)) {
        if (name.toLowerCase() === CSP_HEADER_NAME) {
          policies.push(...(values as string[]));
          delete responseHeaders[name];
        }
      }
      responseHeaders[CSP_HEADER_NAME] = [policies.join(";")];
      callback({ responseHeaders });
      return;
    }
  }
  callback({ responseHeaders: details.responseHeaders });
}

function enableBlockingInSession(engineInstance: FiltersEngine, ses: Electron.Session): void {
  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, onBeforeRequest);
  ses.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, onHeadersReceived);
}

function disableBlockingInSession(ses: Electron.Session): void {
  ses.webRequest.onHeadersReceived(null);
  ses.webRequest.onBeforeRequest(null);
}

export async function initializeAdblocker(): Promise<void> {
  if (blockerInitialized) {
    log.info("[Adblock] Already initialized, skipping");
    return;
  }

  log.info("[Adblock] Initializing ad blocker...");

  try {
    const ses = session.fromPartition(app.isPackaged ? "persist:ytview" : "persist:ytview-dev");
    currentSession = ses;

    if (fs.existsSync(CACHE_PATH)) {
      log.info("[Adblock] Loading cached engine from disk");
      const cachedData = await fs.readFile(CACHE_PATH);
      engine = FiltersEngine.deserialize(new Uint8Array(cachedData));
    } else {
      log.info("[Adblock] Downloading prebuilt filters (first run)");
      engine = await FiltersEngine.fromPrebuiltAdsAndTracking(fetch);
      await saveEngineToCache(engine);
      log.info("[Adblock] Filters cached to disk");
    }

    enableBlockingInSession(engine, ses);
    blockerInitialized = true;

    scheduleFilterUpdate(ses);

    log.info("[Adblock] Successfully initialized");
  } catch (error) {
    log.error("[Adblock] Failed to initialize:", error);
  }
}

export function setAdBlockingEnabled(enabled: boolean): void {
  if (!engine || !currentSession || !blockerInitialized) {
    log.warn("[Adblock] Cannot toggle - not initialized");
    return;
  }

  if (enabled) {
    enableBlockingInSession(engine, currentSession);
    log.info("[Adblock] Blocking enabled");
  } else {
    disableBlockingInSession(currentSession);
    log.info("[Adblock] Blocking disabled");
  }
}

function scheduleFilterUpdate(ses: Electron.Session): void {
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  updateInterval = setInterval(async () => {
    if (engine) {
      try {
        log.info("[Adblock] Updating filter lists...");
        engine = await FiltersEngine.fromPrebuiltAdsAndTracking(fetch);
        disableBlockingInSession(ses);
        enableBlockingInSession(engine, ses);
        await saveEngineToCache(engine);
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
                if (args[0] && typeof args[0] === 'string' && (args[0].includes('/youtubei/') || args[0].includes('get_watch_next') || args[0].includes('/browse'))) {
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
                document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-text-overlay, .video-ads, ytm-ad-slot-renderer, ytm-ad-skip-button-renderer, ytm-instream-ad-slot-renderer, ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-renderer, ytd-promoted-sparkles-web-renderer').forEach(el => {
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
                    document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-text-overlay, .video-ads, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, ytm-ad-slot-renderer, ytm-ad-skip-button-renderer, ytm-instream-ad-slot-renderer, ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-renderer, ytd-promoted-sparkles-web-renderer').forEach(el => {
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
                for (const sel of SKIP_SELECTORS) {
                    let btn = document.querySelector(sel);
                    if (btn) return btn;
                    const player = getPlayer();
                    if (player) {
                        btn = player.querySelector(sel);
                        if (btn) return btn;
                    }
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
