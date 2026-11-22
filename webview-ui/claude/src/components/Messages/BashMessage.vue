<template>
  <!-- Bash mode (`!command`): the command, then its output, as the CLI prints them -->
  <div class="bash-message">
    <template v-for="(block, i) in blocks" :key="i">
      <div v-if="block.command !== undefined" class="bash-command">
        <span class="bash-prompt">!</span>
        <span class="bash-command-text">{{ block.command }}</span>
      </div>
      <pre v-if="block.stdout" class="bash-output custom-scrollbar">{{ block.stdout }}</pre>
      <pre v-if="block.stderr" class="bash-output bash-stderr custom-scrollbar">{{ block.stderr }}</pre>
      <div
        v-if="block.command === undefined && !block.stdout && !block.stderr"
        class="bash-output bash-empty"
      >(no output)</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { BashBlock } from '../../models/ContentBlock';

interface Props {
  message: Message;
  context?: any; // passed by MessageRenderer; declared so it is not rendered into the DOM
}

const props = defineProps<Props>();

const blocks = computed<BashBlock[]>(() => {
  const content = props.message.message.content;
  if (!Array.isArray(content)) return [];
  return content
    .map((wrapper) => wrapper.content)
    .filter((block): block is BashBlock => block.type === 'bash');
});
</script>

<style scoped>
.bash-message {
  margin: 4px 12px 12px;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}

.bash-command {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 2px 0;
  color: var(--vscode-foreground);
}

.bash-prompt {
  color: var(--vscode-terminal-ansiMagenta, #d670d6);
  font-weight: 600;
}

.bash-command-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.bash-output {
  margin: 2px 0 0 16px;
  padding: 0;
  color: var(--cs-fg-66, var(--vscode-descriptionForeground));
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-family: inherit;
  font-size: inherit;
}

.bash-stderr {
  color: var(--vscode-errorForeground);
}

.bash-empty {
  font-style: italic;
  color: var(--cs-fg-36, var(--vscode-descriptionForeground));
}
</style>
