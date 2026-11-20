<template>
  <ToolMessageWrapper
    tool-icon="codicon-globe"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Fetch</span>
      <a v-if="url" :href="url" target="_blank" class="url-link" @click.stop>
        {{ displayUrl }}
      </a>
      <span v-if="statusCode" class="status-badge" :class="statusClass">
        {{ statusCode }} {{ codeText }}
      </span>
      <span v-if="durationMs" class="duration-badge">{{ durationMs }}ms</span>
    </template>

    <template #expandable>
      <!-- Prompt -->
      <div v-if="prompt" class="section">
        <div class="section-label">Prompt</div>
        <div class="section-value">{{ prompt }}</div>
      </div>

      <!-- Response Result -->
      <div v-if="result" class="section">
        <div class="section-label">Response</div>
        <pre class="result-content">{{ result }}</pre>
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

// URL
const url = computed(() => {
  return props.toolUse?.input?.url || props.toolUseResult?.url;
});

// Prompt
const prompt = computed(() => {
  return props.toolUse?.input?.prompt || props.toolUseResult?.prompt;
});

// Response result
const result = computed(() => {
  // Prefer toolUseResult (session load)
  if (props.toolUseResult?.result) {
    return props.toolUseResult.result;
  }

  // Live conversation - get it from toolResult.content
  if (props.toolResult?.content) {
    if (typeof props.toolResult.content === 'string') {
      return props.toolResult.content;
    }
    // If it is an array, extract the text
    if (Array.isArray(props.toolResult.content)) {
      return props.toolResult.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');
    }
  }

  return '';
});

// HTTP status code
const statusCode = computed(() => {
  return props.toolUseResult?.code;
});

// Status text
const codeText = computed(() => {
  return props.toolUseResult?.codeText;
});

// Response time
const durationMs = computed(() => {
  return props.toolUseResult?.durationMs;
});

// Status badge style
const statusClass = computed(() => {
  if (!statusCode.value) return '';
  const code = statusCode.value;
  if (code >= 200 && code < 300) return 'status-success';
  if (code >= 300 && code < 400) return 'status-redirect';
  if (code >= 400 && code < 500) return 'status-client-error';
  if (code >= 500) return 'status-server-error';
  return '';
});

// Shorten the displayed URL
const displayUrl = computed(() => {
  if (!url.value) return '';
  try {
    const urlObj = new URL(url.value);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // Truncate long paths
    if (pathname.length > 30) {
      return `${hostname}${pathname.substring(0, 27)}...`;
    }

    return `${hostname}${pathname}`;
  } catch {
    // If URL parsing fails, show the raw URL
    return url.value.length > 50 ? url.value.substring(0, 47) + '...' : url.value;
  }
});

// Whether this is the permission request phase
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult;
  const hasToolResult = !!props.toolResult && !props.toolResult.is_error;
  return !hasToolUseResult && !hasToolResult;
});

// Expanded by default during the permission request phase, collapsed once done
const shouldExpand = computed(() => {
  // Expand during the permission request phase
  if (isPermissionRequest.value && prompt.value) return true;

  // Expand when there is an error
  if (props.toolResult?.is_error) return true;

  // Expand when there is a result
  if (result.value) return true;

  return false;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.url-link {
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  font-size: 0.85em;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.url-link:hover {
  border-bottom-color: var(--vscode-textLink-foreground);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  font-family: var(--vscode-editor-font-family);
}

.status-success {
  background-color: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
}

.status-redirect {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
}

.status-client-error {
  background-color: color-mix(in srgb, var(--vscode-charts-orange) 20%, transparent);
  color: var(--vscode-charts-orange);
}

.status-server-error {
  background-color: color-mix(in srgb, var(--vscode-charts-red) 20%, transparent);
  color: var(--vscode-charts-red);
}

.duration-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  font-family: var(--vscode-editor-font-family);
}

.section {
  margin-bottom: 12px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 0.85em;
  font-weight: 600;
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  margin-bottom: 6px;
}

.section-value {
  font-size: 0.85em;
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  line-height: 1.5;
}

.result-content {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-editor-foreground);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
