<template>
  <div class="thinking-block">
    <Collapsible>
      <template #trigger="{ open }">
        <div class="thinking-header">
          <span class="thinking-label">Thinking...</span>
          <span class="codicon" :class="open ? 'codicon-chevron-up' : 'codicon-chevron-down'" />
        </div>
      </template>
      <div class="thinking-content">
        {{ block.thinking }}
      </div>
    </Collapsible>
  </div>
</template>

<script setup lang="ts">
import Collapsible from '../../Common/Collapsible.vue'
import type { ThinkingBlock as ThinkingBlockType } from '../../../models/ContentBlock'

interface Props {
  block: ThinkingBlockType
}

defineProps<Props>()
</script>

<style scoped>
.thinking-block {
  margin: 4px 0;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.thinking-header .codicon {
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  transition: opacity 0.1s ease;
}

.thinking-header:hover .codicon {
  opacity: 1;
}

.thinking-label {
  font-size: 14px;
  font-style: italic;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.thinking-header:hover .thinking-label {
  opacity: 1;
}

.thinking-content {
  margin-left: 16px;
  padding: 4px 0;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-secondary-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
