<template>
  <div class="document-block">
    <div class="document-label">📄 {{ documentTitle }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DocumentBlock as DocumentBlockType } from '../../../models/ContentBlock';

interface Props {
  block: DocumentBlockType;
}

const props = defineProps<Props>();

const documentTitle = computed(() => props.block.title || 'Document');
</script>

<style scoped>
.document-block {
  margin: 8px 0;
  padding: 12px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
}

.document-label {
  font-size: 13px;
  color: var(--vscode-editor-foreground);
}
</style>
