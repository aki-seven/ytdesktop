(function() {
  function clickAdSkipButton() {
    var skipButton = document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern");
    if (skipButton) {
      skipButton.click();
      return true;
    }
    return false;
  }

  function seekPastAd() {
    var player = document.querySelector("#movie_player");
    if (player && player.getCurrentTime && player.getDuration) {
      var duration = player.getDuration();
      var currentTime = player.getCurrentTime();
      if (duration > 0 && currentTime > 0 && currentTime < duration && duration < 30) {
        player.seekTo(duration);
        return true;
      }
    }
    return false;
  }

  function closeAdOverlay() {
    var overlayClose = document.querySelector(".ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container button");
    if (overlayClose) {
      overlayClose.click();
      return true;
    }
    return false;
  }

  function handleAd() {
    clickAdSkipButton() || seekPastAd();
    closeAdOverlay();
  }

  new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        handleAd();
        break;
      }
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });

  var ytmStore = window.__YTD_HOOK__ && window.__YTD_HOOK__.ytmStore;
  if (ytmStore) {
    ytmStore.subscribe(function() {
      var state = ytmStore.getState();
      if (state.player && state.player.adPlaying) {
        handleAd();
      }
    });
  }
})();
