<script setup lang="ts">
import { onMounted, ref } from "vue";
import TitleBar from "../../components/TitleBar.vue";
import YTViewLoading from "../../components/YTViewLoading.vue";
import logo from "~assets/icons/ytd_white.png";

const keyboardFocus = ref<HTMLElement>(null);
const keyboardFocusZero = ref<HTMLElement>(null);

onMounted(() => {
  window.onfocus = () => {
    if (document.activeElement != keyboardFocusZero.value) {
      // This resets the focus of keyboard navigation
      keyboardFocusZero.value.focus();
      keyboardFocusZero.value.blur();
    }
  };

  keyboardFocus.value.onfocus = () => {
    window.ytd.switchFocus("yt");
  };

  window.ytd.requestWindowState();
});
</script>

<template>
  <div ref="keyboardFocusZero" tabindex="0"></div>
  <Suspense>
    <TitleBar is-main-window has-home-button has-settings-button has-minimize-button has-maximize-button title="YouTube Desktop App" :icon-file="logo" />
  </Suspense>
  <Suspense>
    <YTViewLoading />
  </Suspense>
  <div ref="keyboardFocus" tabindex="32767"></div>
</template>
