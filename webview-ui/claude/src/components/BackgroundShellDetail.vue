<template>
  <div ref="rootRef" class="shell-detail" @scroll="onScroll">
    <div v-if="truncated" class="shell-note">Showing the last 64 KB</div>
    <pre v-if="output" class="shell-output">{{ output }}</pre>
    <div v-else-if="error" class="shell-note shell-error">{{ error }}</div>
    <div v-else-if="!shell?.outputFile" class="shell-note">Output file not known yet</div>
    <div v-else class="shell-note">No output yet</div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * What a background Bash task printed so far, read from the file the CLI
 * writes its output to and refreshed every second while open. Sticks to the
 * bottom unless the user scrolled up.
 */
export interface BackgroundShell {
  command?: string;
  outputFile?: string;
}

interface Props {
  /** Looked up again on every refresh: the tool result naming the file can arrive later */
  resolve: () => BackgroundShell | undefined;
  readOutput: (path: string) => Promise<{ output?: string; truncated?: boolean; error?: string }>;
}

const props = defineProps<Props>();

const rootRef = ref<HTMLElement>();
const shell = ref<BackgroundShell | undefined>();
const output = ref('');
const truncated = ref(false);
const error = ref('');
let stickToBottom = true;
let timer: ReturnType<typeof setInterval> | undefined;
let reading = false;

function onScroll() {
  const el = rootRef.value;
  if (!el) return;
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
}

async function refresh() {
  if (reading) return;
  reading = true;
  try {
    shell.value = props.resolve();
    const file = shell.value?.outputFile;
    if (!file) return;
    const res = await props.readOutput(file);
    if (res.error) {
      error.value = res.error;
      return;
    }
    error.value = '';
    truncated.value = !!res.truncated;
    if (res.output !== output.value) {
      output.value = res.output ?? '';
      if (stickToBottom) {
        await nextTick();
        const el = rootRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      }
    }
  } finally {
    reading = false;
  }
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 1000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.shell-detail {
  /* Height comes from the dialog it sits in (BackgroundTasksList) */
  min-height: 0;
  overflow-y: auto;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--vscode-editor-foreground);
}


.shell-output {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font: inherit;
  opacity: 0.85;
}

.shell-note {
  opacity: 0.55;
  font-style: italic;
}

.shell-error {
  color: var(--vscode-errorForeground);
  opacity: 1;
}
</style>
