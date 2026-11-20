<template>
  <div v-if="errorContent" class="error-content">
    <span class="codicon codicon-error"></span>
    <span class="error-text">{{ errorContent }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  toolResult?: any;
}

const props = defineProps<Props>();

const errorContent = computed(() => {
  if (!props.toolResult || !props.toolResult.is_error) {
    return null;
  }

  // Extract the error content
  const content = props.toolResult.content;

  // 1. String: try parsing the <tool_use_error> tag, otherwise return as is
  if (typeof content === 'string') {
    const match = content.match(/<tool_use_error>(.*?)<\/tool_use_error>/s);
    return match ? match[1].trim() : content;
  }

  // 2. Array: extract all text content
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text;
        return JSON.stringify(item);
      })
      .join('\n');
  }

  // 3. Object: format as JSON
  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  // 4. Unknown type: return the default error message
  return 'Unknown error';
});
</script>

<style scoped>
.error-content {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--vscode-errorForeground);
}

.error-content .codicon {
  color: var(--vscode-charts-red);
  flex-shrink: 0;
  font-size: 12px;
  line-height: inherit;
}

.error-text {
  word-break: break-word;
}
</style>
