<template>
  <!-- One hook line as the CLI prints it: "PreToolUse:Bash hook error",
       then the hook's own text, muted and indented under it. -->
  <div :class="['hook-block', block.kind]">
    <div class="hook-head" :title="block.command">
      <span :class="['codicon', icon]"></span>
      <span class="hook-name">{{ block.hookName }}</span>
      <span class="hook-label">{{ label }}</span>
      <span v-if="showExitCode" class="hook-exit">exit {{ block.exitCode }}</span>
    </div>
    <pre v-if="block.output" class="hook-output">{{ block.output }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { HookBlock as HookBlockType } from '../../../models/ContentBlock';

interface Props {
  block: HookBlockType;
}

const props = defineProps<Props>();

const LABELS: Record<HookBlockType['kind'], string> = {
  error: 'hook error',
  blocked: 'hook blocked',
  stopped: 'hook stopped the turn',
  message: 'says',
};

const ICONS: Record<HookBlockType['kind'], string> = {
  error: 'codicon-warning',
  blocked: 'codicon-circle-slash',
  stopped: 'codicon-debug-stop',
  message: 'codicon-info',
};

const label = computed(() => LABELS[props.block.kind] ?? 'hook');
const icon = computed(() => ICONS[props.block.kind] ?? 'codicon-info');
// 2 is implied by "blocked"; other codes tell why a hook failed (127 = not found)
const showExitCode = computed(
  () => props.block.kind === 'error' && typeof props.block.exitCode === 'number' && props.block.exitCode !== 0
);
</script>

<style scoped>
.hook-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--cs-fg-66, var(--vscode-descriptionForeground));
}

.hook-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.hook-head .codicon {
  font-size: 13px;
  flex-shrink: 0;
}

.hook-block.error .codicon,
.hook-block.stopped .codicon {
  color: var(--vscode-editorWarning-foreground);
}

.hook-block.blocked .codicon {
  color: var(--vscode-errorForeground);
}

.hook-name {
  font-family: var(--vscode-editor-font-family, monospace);
  color: var(--cs-fg, var(--vscode-foreground));
}

.hook-exit {
  margin-left: 4px;
  color: var(--cs-fg-36, var(--vscode-descriptionForeground));
}

.hook-output {
  margin: 0 0 0 19px;
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  line-height: 1.4;
  color: var(--cs-fg-52, var(--vscode-descriptionForeground));
}
</style>
