<template>
  <div class="unknown-block">
    <div class="unknown-label">Unknown content type</div>
    <pre class="unknown-content">{{ formattedContent }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContentBlockType } from '../../../models/ContentBlock';

interface Props {
  block: ContentBlockType;
}

const props = defineProps<Props>();

const formattedContent = computed(() => {
  try {
    return JSON.stringify(props.block, null, 2);
  } catch {
    return String(props.block);
  }
});
</script>

<style scoped>
.unknown-block {
  margin: 8px 0;
  padding: 12px;
  background-color: var(--vscode-inputValidation-warningBackground);
  border-left: 3px solid var(--vscode-inputValidation-warningBorder);
  border-radius: 4px;
}

.unknown-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-inputValidation-warningForeground);
  margin-bottom: 8px;
}

.unknown-content {
  font-size: 11px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  opacity: 0.8;
  overflow-x: auto;
  margin: 0;
}
</style>
