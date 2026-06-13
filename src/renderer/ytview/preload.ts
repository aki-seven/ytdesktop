// IMPORTANT NOTES ABOUT THIS FILE
//
// This file contains all logic related to interacting with YTM itself and works under the assumption of a trusted environment and data.
// Anything passed to this file does not necessarily need to be or will be validated.
//
// If adding new things to this file ensure best security practices are followed.
// - executeJavaScript is used to enter the main world when you need to interact with YTM APIs or anything from YTM that would otherwise need the prototypes or events from YTM.
//   - Always wrap your executeJavaScript code in an IIFE calling it from outside executeJavaScript when it returns
// - Add functions to exposeInMainWorld when you need to call back to the main program. By nature you should not trust data coming from this.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import Store from "../store-ipc/store";
import { StoreSchema } from "~shared/store/schema";

import playerBarControlsScript from "./scripts/playerbarcontrols.script?raw";
import hookPlayerApiEventsScript from "./scripts/hookplayerapievents.script?raw";
import getPlaylistsScript from "./scripts/getplaylists.script?raw";
import toggleLikeScript from "./scripts/togglelike.script?raw";
import toggleDislikeScript from "./scripts/toggledislike.script?raw";
import skipAdsScript from "./scripts/skipads.script?raw";

const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytd", {
  sendVideoProgress: (volume: number) => ipcRenderer.send("ytView:videoProgressChanged", volume),
  sendVideoState: (state: number) => ipcRenderer.send("ytView:videoStateChanged", state),
  sendVideoData: (videoDetails: unknown, playlistId: string, album: { id: string; text: string }, likeStatus: unknown, hasFullMetadata: boolean) =>
    ipcRenderer.send("ytView:videoDataChanged", videoDetails, playlistId, album, likeStatus, hasFullMetadata),
  sendStoreUpdate: (queueState: unknown, likeStatus: string, volume: number, muted: boolean, adPlaying: boolean) =>
    ipcRenderer.send("ytView:storeStateChanged", queueState, likeStatus, volume, muted, adPlaying),
  sendCreatePlaylistObservation: (playlist: unknown) => ipcRenderer.send("ytView:createPlaylistObserved", playlist),
  sendDeletePlaylistObservation: (playlistId: string) => ipcRenderer.send("ytView:deletePlaylistObserved", playlistId)
});

function createStyleSheet() {
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(`
      .ytd-history-back, .ytd-history-forward {
        cursor: pointer;
        margin: 0 18px 0 2px;
        font-size: 24px;
        color: rgba(255, 255, 255, 0.5);
      }

      .ytd-history-back.pivotbar, .ytd-history-forward.pivotbar {
        padding-top: 12px;
      }

      .ytd-history-back.disabled, .ytd-history-forward.disabled {
        cursor: not-allowed;
      }

      .ytd-history-back:hover:not(.disabled), .ytd-history-forward:hover:not(.disabled) {
        color: #FFFFFF;
      }

      .ytd-hidden {
        display: none;
      }

      .ytd-persist-volume-slider {
        opacity: 1 !important;
        pointer-events: initial !important;
      }
      
      .ytd-player-bar-control.library-button {
        margin-left: 8px;
      }

      .ytd-player-bar-control.library-button.hidden {
        display: none;
      }

      .ytd-player-bar-control.playlist-button {
        margin-left: 8px;
      }

      .ytd-player-bar-control.playlist-button.hidden {
        display: none;
      }

      .ytd-player-bar-control.sleep-timer-button.active {
        color: #FFFFFF;
      }
    `)
  );
  document.head.appendChild(css);
}

function createMaterialSymbolsLink() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100,0,0";
  return link;
}

function createNavigationMenuArrows() {
  // Go back in history
  const historyBackElement = document.createElement("span");
  historyBackElement.classList.add("material-symbols-outlined", "ytd-history-back", "disabled");
  historyBackElement.innerText = "west";

  historyBackElement.addEventListener("click", function () {
    if (!historyBackElement.classList.contains("disabled")) {
      history.back();
    }
  });

  // Go forward in history
  const historyForwardElement = document.createElement("span");
  historyForwardElement.classList.add("material-symbols-outlined", "ytd-history-forward", "disabled");
  historyForwardElement.innerText = "east";

  historyForwardElement.addEventListener("click", function () {
    if (!historyForwardElement.classList.contains("disabled")) {
      history.forward();
    }
  });

  ipcRenderer.on("ytView:navigationStateChanged", (event, state) => {
    if (state.canGoBack) {
      historyBackElement.classList.remove("disabled");
    } else {
      historyBackElement.classList.add("disabled");
    }

    if (state.canGoForward) {
      historyForwardElement.classList.remove("disabled");
    } else {
      historyForwardElement.classList.add("disabled");
    }
  });

  const pivotBar = document.querySelector("ytd-pivot-tab-bar");
  if (!pivotBar) {
    const searchBar = document.querySelector("#search-input");
    if (searchBar && searchBar.parentNode) {
      const navBar = searchBar.parentNode;
      navBar.insertBefore(historyForwardElement, searchBar);
      navBar.insertBefore(historyBackElement, historyForwardElement);
    }
  } else {
    historyForwardElement.classList.add("pivotbar");
    historyBackElement.classList.add("pivotbar");
    pivotBar.prepend(historyForwardElement);
    pivotBar.prepend(historyBackElement);
  }
}

function createKeyboardNavigation() {
  const keyboardNavigation = document.createElement("div");
  keyboardNavigation.tabIndex = 32767;
  keyboardNavigation.onfocus = () => {
    keyboardNavigation.blur();
    ipcRenderer.send("ytView:switchFocus", "main");
  };
  document.body.appendChild(keyboardNavigation);
}

async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}

async function hideChromecastButton() {
  (
    await webFrame.executeJavaScript(`
      (function() {
        window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_CAST_AVAILABLE', payload: false });
      })
    `)
  )();
}

async function hookPlayerApiEvents() {
  (await webFrame.executeJavaScript(hookPlayerApiEventsScript))();
}

function overrideHistoryButtonDisplay() {
  const el = document.querySelector<HTMLElement>("#history-link .history-button");
  if (el) {
    el.style.setProperty("display", "inline-block !important", "important");
  }
}

function getYTTextRun(runs: { text: string }[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

// This function helps hook YTM
(async function () {
  (
    await webFrame.executeJavaScript(`
    (function() {
      let fakeBaseClass = function() {
        try {
          if (!window.__YTD_HOOK__) {
            if (this.store && !!this.store.getState && !!this.store.dispatch && !!this.store.subscribe) {
              let ytdHook = {
                ytmStore: this.store
              };
              Object.freeze(ytdHook);
              window.__YTD_HOOK__ = ytdHook;
            }
          }
        } catch {}
      }
      Object.defineProperty(window, "PolymerFakeBaseClassWithoutHtml", {
        set: (value) => {},
        get: () => {
          return fakeBaseClass
        }
      })
    })
  `)
  )();
})();

window.addEventListener("load", async () => {
  if (window.location.hostname !== "www.youtube.com" && window.location.hostname !== "youtube.com") {
    if (window.location.hostname === "consent.youtube.com" || window.location.hostname === "accounts.google.com") {
      ipcRenderer.send("ytView:loaded");
    }
    return;
  }

  let isYTM = false;
  await new Promise<void>(resolve => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const hooked = (
          await webFrame.executeJavaScript(`
          (function() {
            if (window.__YTD_HOOK__) {
              return true;
            }
            return false;
          })
        `)
        )();

        if (hooked) {
          isYTM = true;
          clearInterval(interval);
          resolve();
        }
      } catch {
        // Ignore errors during hook check
      }

      if (attempts > 8) {
        // Timeout after ~2 seconds for regular YouTube
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });

  let materialSymbolsLoaded = false;

  const materialSymbols = createMaterialSymbolsLink();
  materialSymbols.onload = () => {
    materialSymbolsLoaded = true;
  };
  document.head.appendChild(materialSymbols);

  await new Promise<void>(resolve => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const playerApiReady: boolean = (
          await webFrame.executeJavaScript(`
            (function() {
              return document.getElementById("movie_player")?.getPlayerResponse() ? true : false;
            })
          `)
        )();

        if (materialSymbolsLoaded && playerApiReady) {
          clearInterval(interval);
          resolve();
        }
      } catch {
        // Ignore errors during player check
      }

      if (attempts > 20) {
        // Timeout after ~5 seconds
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });

  // Initialize app (wrapped in try-catch to ensure ytView:loaded is always sent)
  try {
    createStyleSheet();
    createNavigationMenuArrows();
    createKeyboardNavigation();

    if (isYTM) {
      try {
        await createAdditionalPlayerBarControls();
        await hideChromecastButton();
        await hookPlayerApiEvents();
        overrideHistoryButtonDisplay();
      } catch {
        // YTM features are optional and may fail on some page variants
      }
    }

    // Run ad skipping script
    try {
      (await webFrame.executeJavaScript(skipAdsScript))();
    } catch {
      // Ignore errors
    }

    let integrationScripts: { [integrationName: string]: { [scriptName: string]: string } } = {};
    try {
      integrationScripts = await ipcRenderer.invoke("ytView:getIntegrationScripts");
    } catch {
      // Ignore errors
    }

    let state = { lastUrl: "https://www.youtube.com/", lastVideoId: "", lastPlaylistId: "" };
    let continueWhereYouLeftOff = false;
    try {
      state = await store.get("state") || state;
      continueWhereYouLeftOff = ((await store.get("playback")) || {}).continueWhereYouLeftOff || false;
    } catch {
      // Ignore errors
    }

  if (continueWhereYouLeftOff && isYTM) {
    // The last page the user was on is already a page where it will be playing a video from (no point telling YouTube to play it again)
    if (!state.lastUrl.startsWith("https://www.youtube.com/watch")) {
      if (state.lastVideoId) {
        // This height transition check is a hack to fix the `Start playback` hint from not being in the correct position https://github.com/ytdesktop/ytdesktop/issues/1159
        let heightTransitionCount = 0;
        const transitionEnd = async (e: TransitionEvent) => {
          if (e.target === document.querySelector("#movie_player")) {
            if (e.propertyName === "height") {
              (
                await webFrame.executeJavaScript(`
                  (function() {
                    document.querySelector("ytmusic-popup-container").refitPopups_();
                  })
                `)
              )();
              heightTransitionCount++;
              if (heightTransitionCount >= 2) {
                document.querySelector("#movie_player").removeEventListener("transitionend", transitionEnd);
              }
            }
          }
        };
        document.querySelector("#movie_player").addEventListener("transitionend", transitionEnd);

        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint: {
                watchEndpoint: {
                  videoId: state.lastVideoId,
                  playlistId: state.lastPlaylistId
                }
              }
            }
          })
        );
      }
    } else {
      (
        await webFrame.executeJavaScript(`
          (function() {
            window.ytd.sendVideoData(document.querySelector("#movie_player").playerApi.getPlayerResponse().videoDetails, document.querySelector("#movie_player").playerApi.getPlaylistId());
          })
        `)
      )();
    }
  }

  // Always show volume slider (YTM specific feature)
  if (isYTM) {
    const alwaysShowVolumeSlider = (await store.get("appearance")).alwaysShowVolumeSlider;
    if (alwaysShowVolumeSlider) {
      const volumeSlider = document.querySelector("#movie_player #volume-slider");
      if (volumeSlider) {
        volumeSlider.classList.add("ytd-persist-volume-slider");
      }
    }
  }

  // Remote control command handler
  ipcRenderer.on("remoteControl:execute", async (_event, command, value) => {
    try {
    switch (command) {
      case "playPause": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              const player = document.querySelector("#movie_player");
              const isPlaying = player.getPlayerState ? player.getPlayerState() === 1 : player.playing;
              isPlaying ? player.pauseVideo() : player.playVideo();
            })
          `)
        )();
        break;
      }

      case "play": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("#movie_player").playerApi.playVideo();
            })
          `)
        )();
        break;
      }

      case "pause": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("#movie_player").playerApi.pauseVideo();
            })
          `)
        )();
        break;
      }

      case "next": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              const player = document.querySelector("#movie_player");
              if (player.nextVideo) player.nextVideo();
            })
          `)
        )();
        break;
      }

      case "previous": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              const player = document.querySelector("#movie_player");
              if (player.previousVideo) player.previousVideo();
            })
          `)
        )();
        break;
      }

      case "toggleLike": {
        if (!isYTM) break;
        (await webFrame.executeJavaScript(toggleLikeScript))();
        break;
      }

      case "toggleDislike": {
        if (!isYTM) break;
        (await webFrame.executeJavaScript(toggleDislikeScript))();
        break;
      }

      case "volumeUp": {
        const currentVolumeUp: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return document.querySelector("#movie_player").getVolume();
            })
          `)
        )();

        let newVolumeUp = currentVolumeUp + 10;
        if (newVolumeUp > 100) {
          newVolumeUp = 100;
        }
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeUp) {
              const player = document.querySelector("#movie_player");
              player.setVolume(newVolumeUp);
              try { window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeUp }); } catch {}
            })
          `)
        )(newVolumeUp);
        break;
      }

      case "volumeDown": {
        const currentVolumeDown: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return document.querySelector("#movie_player").getVolume();
            })
          `)
        )();

        let newVolumeDown = currentVolumeDown - 10;
        if (newVolumeDown < 0) {
          newVolumeDown = 0;
        }
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeDown) {
              const player = document.querySelector("#movie_player");
              player.setVolume(newVolumeDown);
              try { window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeDown }); } catch {}
            })
          `)
        )(newVolumeDown);
        break;
      }

      case "setVolume": {
        const valueInt: number = parseInt(value);
        // Check if Volume is a number and between 0 and 100
        if (isNaN(valueInt) || valueInt < 0 || valueInt > 100) {
          return;
        }

        (
          await webFrame.executeJavaScript(`
            (function(valueInt) {
              const player = document.querySelector("#movie_player");
              player.setVolume(valueInt);
              try { window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: valueInt }); } catch {}
            })
          `)
        )(valueInt);
        break;
      }

      case "mute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              const player = document.querySelector("#movie_player");
              player.mute();
              try { window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: true }); } catch {}
            })
          `)
        )();
        break;

      case "unmute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              const player = document.querySelector("#movie_player");
              player.unMute();
              try { window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: false }); } catch {}
            })
          `)
        )();
        break;

      case "repeatMode":
        if (!isYTM) break;
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_REPEAT', payload: value });
            })
          `)
        )(value);
        break;

      case "seekTo":
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              document.querySelector("#movie_player").seekTo(value);
            })
          `)
        )(value);
        break;

      case "shuffle":
        if (!isYTM) break;
        (
          await webFrame.executeJavaScript(`
            (function() {
              document.querySelector("#movie_player").queue.shuffle();
            })
          `)
        )();
        break;

      case "playQueueIndex": {
        if (!isYTM) break;
        const index: number = parseInt(value);

        (
          await webFrame.executeJavaScript(`
            (function(index) {
              const state = window.__YTD_HOOK__.ytmStore.getState();
              const queue = state.queue;

              const maxQueueIndex = state.queue.items.length - 1;
              const maxAutoMixQueueIndex = Math.max(state.queue.automixItems.length - 1, 0);

              let useAutoMix = false;
              if (index > maxQueueIndex) {
                index = index - state.queue.items.length;
                useAutoMix = true;
              }

              let song = null;
              if (!useAutoMix) {
                song = queue.items[index];
              } else {
                song = queue.automixItems[index];
              }

              let playlistPanelVideoRenderer;
              if (song.playlistPanelVideoRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoRenderer;
              } else if (song.playlistPanelVideoWrapperRenderer) {
                playlistPanelVideoRenderer = song.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
              }

              document.dispatchEvent(
                new CustomEvent("yt-navigate", {
                  detail: {
                    endpoint: {
                      watchEndpoint: playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint
                    }
                  }
                })
              );
            })
          `)
        )(index);

        break;
      }

      case "navigate": {
        const endpoint = value;
        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint
            }
          })
        );
        break;
      }
    }
  } catch {
    // Ignore errors during remote control execution
  }
  });

  // Get playlists (YTM specific feature)
  if (isYTM) {
    ipcRenderer.on("ytView:getPlaylists", async (_event, requestId) => {
      try {
        const rawPlaylists = await (await webFrame.executeJavaScript(getPlaylistsScript))();

        const playlists = [];
        for (const rawPlaylist of rawPlaylists) {
          const playlist = rawPlaylist.playlistAddToOptionRenderer;
          playlists.push({
            id: playlist.playlistId,
            title: getYTTextRun(playlist.title.runs)
          });
        }
        ipcRenderer.send(`ytView:getPlaylists:response:${requestId}`, playlists);
      } catch {
        // Ignore errors
      }
    });
  }

  // Always show volume slider state change handler (YTM specific)
  if (isYTM) {
    store.onDidAnyChange(newState => {
      if (newState.appearance.alwaysShowVolumeSlider) {
        const volumeSlider = document.querySelector("#volume-slider");
        if (volumeSlider && !volumeSlider.classList.contains("ytd-persist-volume-slider")) {
          volumeSlider.classList.add("ytd-persist-volume-slider");
        }
      } else {
        const volumeSlider = document.querySelector("#volume-slider");
        if (volumeSlider && volumeSlider.classList.contains("ytd-persist-volume-slider")) {
          volumeSlider.classList.remove("ytd-persist-volume-slider");
        }
      }
    });
  }

  ipcRenderer.on("ytView:refitPopups", async () => {
    // Update 4/14/2024: Broken until a hook is provided for this
    /*
    (
      await webFrame.executeJavaScript(`
        (function() {
          document.querySelector("ytmusic-popup-container").refitPopups_();
        })
      `)
    )();
    */
  });

  ipcRenderer.on("ytView:executeScript", async (_event, integrationName, scriptName) => {
    const scripts = integrationScripts[integrationName];
    if (scripts) {
      const script = scripts[scriptName];
      if (script) {
        (await webFrame.executeJavaScript(script))();
      }
    }
  });

  } catch {
    // Ignore initialization errors
  }

  // Signal that the view is loaded
  ipcRenderer.send("ytView:loaded");
});
