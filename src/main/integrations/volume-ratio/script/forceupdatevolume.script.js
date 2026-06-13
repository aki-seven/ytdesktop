(function() {
  let volume = document.querySelector("ytmusic-player-bar").playerApi.getVolume();
  document.querySelector("ytmusic-player-bar").playerApi.setVolume(volume);
  window.__YTD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: volume });
})
