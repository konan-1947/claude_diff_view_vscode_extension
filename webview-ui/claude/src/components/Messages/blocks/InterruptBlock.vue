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
/* Left-aligned like an ordinary log row */
.interrupt-block {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: transparent;
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
