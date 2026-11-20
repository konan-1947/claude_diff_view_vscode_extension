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
  margin: 2px 16px;
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
  font-size: 12px;
  font-style: italic;
  color: var(--vscode-descriptionForeground);
  opacity: 0.5;
  transition: opacity 100ms ease;
}

.thinking-header:hover .thinking-label {
  opacity: 1;
}

.thinking-content {
  margin-top: 6px;
  padding: 6px 10px;
  border-left: 2px solid color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  max-height: 240px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-secondary-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
