<template>
  <div class="llm-error-block">
    <span class="codicon codicon-error"></span>
    <span class="llm-error-message">{{ block.message }}</span>
  </div>
</template>

<script setup lang="ts">
import type { LLMErrorBlock as LLMErrorBlockType } from '../../../models/ContentBlock';

interface Props {
  block: LLMErrorBlockType;
}

defineProps<Props>();
</script>

<style scoped>
/* Same centered banner style as InterruptBlock, with error colors */
.llm-error-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: transparent;
}

.llm-error-block .codicon {
  color: var(--vscode-testing-iconFailed);
  flex-shrink: 0;
}

.llm-error-message {
  color: color-mix(in srgb, var(--vscode-errorForeground, #f48771) 85%, transparent);
  font-style: italic;
}
</style>
