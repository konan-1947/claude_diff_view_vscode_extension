<template>
  <div class="interrupt-block">
    <span class="codicon codicon-info"></span>
    <span class="interrupt-message">{{ block.friendlyMessage }}</span>
  </div>
</template>

<script setup lang="ts">
import type { InterruptBlock as InterruptBlockType } from '../../../models/ContentBlock';

interface Props {
  block: InterruptBlockType;
}

defineProps<Props>();
</script>

<style scoped>
/* Matches the Claudex SystemMessage style */
.interrupt-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: transparent;
  transform: translateX(-10px);
}

.interrupt-block .codicon {
  color: var(--vscode-charts-yellow);
  flex-shrink: 0;
}

.interrupt-message {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-style: italic;
}
</style>
