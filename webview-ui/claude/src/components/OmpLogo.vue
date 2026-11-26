<template>
  <!-- Empty OMP chat: omp's pixel mark (the block-character logo the CLI prints) + "omp" + the CLI version -->
  <div class="omp-logo">
    <OmpMark class="omp-logo-mark" />
    <div class="omp-text">
      <svg class="omp-wordmark" width="63" height="28" viewBox="0 0 135 60" aria-label="omp" role="img">
        <path d="M9 0h9v10h-9zM18 0h9v10h-9zM45 0h9v10h-9zM54 0h9v10h-9zM72 0h9v10h-9zM99 0h9v10h-9zM108 0h9v10h-9zM117 0h9v10h-9zM0 10h9v10h-9zM27 10h9v10h-9zM45 10h9v10h-9zM63 10h9v10h-9zM81 10h9v10h-9zM99 10h9v10h-9zM126 10h9v10h-9zM0 20h9v10h-9zM27 20h9v10h-9zM45 20h9v10h-9zM63 20h9v10h-9zM81 20h9v10h-9zM99 20h9v10h-9zM126 20h9v10h-9zM9 30h9v10h-9zM18 30h9v10h-9zM45 30h9v10h-9zM63 30h9v10h-9zM81 30h9v10h-9zM99 30h9v10h-9zM108 30h9v10h-9zM117 30h9v10h-9zM99 40h9v10h-9zM99 50h9v10h-9z" fill="currentColor" />
      </svg>
      <!-- Line kept when the version is not known yet, so nothing moves when it arrives -->
      <div class="omp-version">{{ version ? 'v' + version : '\xa0' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import OmpMark from './OmpMark.vue';

defineProps<{ version?: string }>();
</script>

<style scoped>
.omp-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  user-select: none;
}
.omp-logo-mark {
  width: 58px;
  height: 54px;
}
.omp-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omp-wordmark {
  display: block;
  color: var(--vscode-foreground);
  shape-rendering: crispEdges;
}
.omp-version {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 16px;
  color: var(--vscode-descriptionForeground);
}
</style>
