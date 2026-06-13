<script setup lang="ts">
import { onBeforeMount, ref } from "vue";
import logo from "~assets/icons/ytd.png";

const memoryStore = window.ytd.memoryStore;

const ytViewLoading = ref<boolean>(await memoryStore.get("ytViewLoading"));
const ytViewLoadingError = ref<boolean>(await memoryStore.get("ytViewLoadingError"));
const ytViewLoadTimedout = ref<boolean>(await memoryStore.get("ytViewLoadTimedout"));
const ytViewLoadingStatus = ref<string>((await memoryStore.get("ytViewLoadingStatus")) ?? "");

onBeforeMount(async () => {
  ytViewLoading.value = await memoryStore.get("ytViewLoading");
  ytViewLoadTimedout.value = await memoryStore.get("ytViewLoadTimedout");
  ytViewLoadingError.value = await memoryStore.get("ytViewLoadingError");
  ytViewLoadingStatus.value = (await memoryStore.get("ytViewLoadingStatus")) ?? "";
});

memoryStore.onStateChanged(newState => {
  ytViewLoading.value = newState.ytViewLoading;
  ytViewLoadingError.value = newState.ytViewLoadingError;
  ytViewLoadTimedout.value = newState.ytViewLoadTimedout;
  ytViewLoadingStatus.value = newState.ytViewLoadingStatus;
});
</script>

<template>
  <div class="ytview-loading-container">
    <Transition name="fade">
      <div v-if="ytViewLoading" class="ytview-loading">
        <img class="logo" :src="logo" />
        <div class="music-loader">
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
          <div class="loader-line"></div>
        </div>
        <p :class="{ 'ytview-loading-status': true, 'error': ytViewLoadingError }">{{ ytViewLoadingStatus }}</p>
        <p v-if="ytViewLoadTimedout" class="ytview-loading-timeout">YouTube is taking longer than usual to load</p>
      </div>
      <div v-else class="ytview-loading"></div>
    </Transition>
  </div>
</template>

<style scoped>
.ytview-loading-container {
  height: calc(100% - 36px);
  background-color: #000000;
}

.ytview-loading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: calc(100% - 36px);
  user-select: none;
}

.ytview-loading-status {
  color: #969696;
}

.ytview-loading-status.error {
  color: #f44336;
}

.ytview-loading-timeout {
  color: #f44336;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.logo {
  width: 160px;
  height: 160px;
}

.music-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 160px;
}

.loader-line {
  width: 12px;
  height: 4px;
  border-radius: 10px;
  background-color: #ffffff;
  animation: musicloader 1.5s ease-in-out infinite;
}

.loader-line:nth-child(1) {
  animation-delay: 1s;
}

.loader-line:nth-child(2) {
  animation-delay: 0.8s;
}

.loader-line:nth-child(3) {
  animation-delay: 0.4s;
}

.loader-line:nth-child(4) {
  animation-delay: 0.2s;
}

.loader-line:nth-child(5) {
  animation-delay: 0.2s;
}

.loader-line:nth-child(6) {
  animation-delay: 0.4s;
}

.loader-line:nth-child(7) {
  animation-delay: 0.8s;
}

.loader-line:nth-child(8) {
  animation-delay: 1s;
}

@keyframes musicloader {
  0% {
    height: 4px;
  }
  50% {
    height: 72px;
  }
  100% {
    height: 4px;
  }
}
</style>
