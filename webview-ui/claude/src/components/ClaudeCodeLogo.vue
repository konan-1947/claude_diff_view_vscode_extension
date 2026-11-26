<template>
  <!-- Empty chat: Clawd + a pixel "Claude Code" wordmark + the CLI version -->
  <div class="cc-logo">
    <ClawdIcon class="cc-mascot" />
    <div class="cc-text">
      <svg class="cc-wordmark" width="248" height="28" viewBox="0 0 248 28" aria-label="Claude Code" role="img">
        <path d="M4 0h3.4v3.4h-3.4zM8 0h3.4v3.4h-3.4zM12 0h3.4v3.4h-3.4zM0 4h3.4v3.4h-3.4zM16 4h3.4v3.4h-3.4zM0 8h3.4v3.4h-3.4zM0 12h3.4v3.4h-3.4zM0 16h3.4v3.4h-3.4zM0 20h3.4v3.4h-3.4zM16 20h3.4v3.4h-3.4zM4 24h3.4v3.4h-3.4zM8 24h3.4v3.4h-3.4zM12 24h3.4v3.4h-3.4zM28 0h3.4v3.4h-3.4zM32 0h3.4v3.4h-3.4zM32 4h3.4v3.4h-3.4zM32 8h3.4v3.4h-3.4zM32 12h3.4v3.4h-3.4zM32 16h3.4v3.4h-3.4zM32 20h3.4v3.4h-3.4zM28 24h3.4v3.4h-3.4zM32 24h3.4v3.4h-3.4zM36 24h3.4v3.4h-3.4zM52 8h3.4v3.4h-3.4zM56 8h3.4v3.4h-3.4zM60 8h3.4v3.4h-3.4zM64 12h3.4v3.4h-3.4zM52 16h3.4v3.4h-3.4zM56 16h3.4v3.4h-3.4zM60 16h3.4v3.4h-3.4zM64 16h3.4v3.4h-3.4zM48 20h3.4v3.4h-3.4zM64 20h3.4v3.4h-3.4zM52 24h3.4v3.4h-3.4zM56 24h3.4v3.4h-3.4zM60 24h3.4v3.4h-3.4zM64 24h3.4v3.4h-3.4zM72 8h3.4v3.4h-3.4zM88 8h3.4v3.4h-3.4zM72 12h3.4v3.4h-3.4zM88 12h3.4v3.4h-3.4zM72 16h3.4v3.4h-3.4zM88 16h3.4v3.4h-3.4zM72 20h3.4v3.4h-3.4zM84 20h3.4v3.4h-3.4zM88 20h3.4v3.4h-3.4zM76 24h3.4v3.4h-3.4zM80 24h3.4v3.4h-3.4zM88 24h3.4v3.4h-3.4zM112 0h3.4v3.4h-3.4zM112 4h3.4v3.4h-3.4zM100 8h3.4v3.4h-3.4zM104 8h3.4v3.4h-3.4zM112 8h3.4v3.4h-3.4zM96 12h3.4v3.4h-3.4zM108 12h3.4v3.4h-3.4zM112 12h3.4v3.4h-3.4zM96 16h3.4v3.4h-3.4zM112 16h3.4v3.4h-3.4zM96 20h3.4v3.4h-3.4zM112 20h3.4v3.4h-3.4zM100 24h3.4v3.4h-3.4zM104 24h3.4v3.4h-3.4zM108 24h3.4v3.4h-3.4zM112 24h3.4v3.4h-3.4zM124 8h3.4v3.4h-3.4zM128 8h3.4v3.4h-3.4zM132 8h3.4v3.4h-3.4zM120 12h3.4v3.4h-3.4zM136 12h3.4v3.4h-3.4zM120 16h3.4v3.4h-3.4zM124 16h3.4v3.4h-3.4zM128 16h3.4v3.4h-3.4zM132 16h3.4v3.4h-3.4zM136 16h3.4v3.4h-3.4zM120 20h3.4v3.4h-3.4zM124 24h3.4v3.4h-3.4zM128 24h3.4v3.4h-3.4zM132 24h3.4v3.4h-3.4zM160 0h3.4v3.4h-3.4zM164 0h3.4v3.4h-3.4zM168 0h3.4v3.4h-3.4zM156 4h3.4v3.4h-3.4zM172 4h3.4v3.4h-3.4zM156 8h3.4v3.4h-3.4zM156 12h3.4v3.4h-3.4zM156 16h3.4v3.4h-3.4zM156 20h3.4v3.4h-3.4zM172 20h3.4v3.4h-3.4zM160 24h3.4v3.4h-3.4zM164 24h3.4v3.4h-3.4zM168 24h3.4v3.4h-3.4zM184 8h3.4v3.4h-3.4zM188 8h3.4v3.4h-3.4zM192 8h3.4v3.4h-3.4zM180 12h3.4v3.4h-3.4zM196 12h3.4v3.4h-3.4zM180 16h3.4v3.4h-3.4zM196 16h3.4v3.4h-3.4zM180 20h3.4v3.4h-3.4zM196 20h3.4v3.4h-3.4zM184 24h3.4v3.4h-3.4zM188 24h3.4v3.4h-3.4zM192 24h3.4v3.4h-3.4zM220 0h3.4v3.4h-3.4zM220 4h3.4v3.4h-3.4zM208 8h3.4v3.4h-3.4zM212 8h3.4v3.4h-3.4zM220 8h3.4v3.4h-3.4zM204 12h3.4v3.4h-3.4zM216 12h3.4v3.4h-3.4zM220 12h3.4v3.4h-3.4zM204 16h3.4v3.4h-3.4zM220 16h3.4v3.4h-3.4zM204 20h3.4v3.4h-3.4zM220 20h3.4v3.4h-3.4zM208 24h3.4v3.4h-3.4zM212 24h3.4v3.4h-3.4zM216 24h3.4v3.4h-3.4zM220 24h3.4v3.4h-3.4zM232 8h3.4v3.4h-3.4zM236 8h3.4v3.4h-3.4zM240 8h3.4v3.4h-3.4zM228 12h3.4v3.4h-3.4zM244 12h3.4v3.4h-3.4zM228 16h3.4v3.4h-3.4zM232 16h3.4v3.4h-3.4zM236 16h3.4v3.4h-3.4zM240 16h3.4v3.4h-3.4zM244 16h3.4v3.4h-3.4zM228 20h3.4v3.4h-3.4zM232 24h3.4v3.4h-3.4zM236 24h3.4v3.4h-3.4zM240 24h3.4v3.4h-3.4z" fill="currentColor" />
      </svg>
      <!-- Line kept when the version is not known yet, so nothing moves when it arrives -->
      <div class="cc-version">{{ version ? 'v' + version : '\xa0' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ClawdIcon from './ClawdIcon.vue';

defineProps<{ version?: string }>();
</script>

<style scoped>
.cc-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  user-select: none;
}
.cc-mascot {
  width: 59px;
  height: 48px;
  flex: 0 0 auto;
}
.cc-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cc-wordmark {
  display: block;
  color: var(--vscode-foreground);
}
.cc-version {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 16px;
  color: var(--vscode-descriptionForeground);
}
</style>
