<template>
  <ToolMessageWrapper
    tool-icon="codicon-grep"
    tool-name="Grep"
    :tool-result="toolResult"
  >
    <template #main>
      <span class="tool-label">Grep</span>
      <code v-if="pattern" class="pattern-text">{{ pattern }}</code>
    </template>

    <!-- Expanded content: search options and results -->
    <template #expandable>
      <!-- Search options -->
      <div v-if="hasSearchOptions" class="options-section">
        <div class="options-grid">
          <div v-if="searchPath" class="option-item">
            <span class="codicon codicon-folder"></span>
            <span class="option-text">Path: {{ searchPath }}</span>
          </div>
          <div v-if="glob" class="option-item">
            <span class="codicon codicon-filter"></span>
            <span class="option-text">Filter: {{ glob }}</span>
          </div>
          <div v-if="fileType" class="option-item">
            <span class="codicon codicon-file-code"></span>
            <span class="option-text">Type: {{ fileType }}</span>
          </div>
          <div v-if="outputMode" class="option-item">
            <span class="codicon codicon-output"></span>
            <span class="option-text">Mode: {{ outputMode }}</span>
          </div>
        </div>
      </div>

      <!-- Search flags -->
      <div v-if="hasFlags" class="flags-section">
        <div class="detail-label">Flags:</div>
        <div class="flags-list">
          <span v-if="caseInsensitive" class="flag-tag">
            <span class="codicon codicon-case-sensitive"></span>
            Ignore case
          </span>
          <span v-if="multiline" class="flag-tag">
            <span class="codicon codicon-whole-word"></span>
            Multiline
          </span>
          <span v-if="showLineNumbers" class="flag-tag">
            <span class="codicon codicon-list-ordered"></span>
            Line numbers
          </span>
          <span v-if="contextLines" class="flag-tag">
            <span class="codicon codicon-list-tree"></span>
            Context: {{ contextLines }} line(s)
          </span>
          <span v-if="headLimit" class="flag-tag">
            <span class="codicon codicon-arrow-up"></span>
            Limit: {{ headLimit }}
          </span>
        </div>
      </div>

      <!-- Search results -->
      <div v-if="resultFiles.length > 0" class="results-section">
        <div class="detail-label">
          <span>Found {{ fileCount }} file(s):</span>
        </div>
        <div class="file-list">
          <ToolFilePath
            v-for="(file, index) in resultFiles"
            :key="index"
            :file-path="file"
            :context="context"
            class="file-item"
          />
        </div>
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

// Search pattern
const pattern = computed(() => props.toolUse?.input?.pattern);

// Search options
const searchPath = computed(() => props.toolUse?.input?.path);
const glob = computed(() => props.toolUse?.input?.glob);
const fileType = computed(() => props.toolUse?.input?.type);
const outputMode = computed(() => props.toolUse?.input?.output_mode);

// Search flags
const caseInsensitive = computed(() => props.toolUse?.input?.['-i']);
const multiline = computed(() => props.toolUse?.input?.multiline);
const showLineNumbers = computed(() => props.toolUse?.input?.['-n']);
const contextLines = computed(() => {
  return props.toolUse?.input?.['-A'] || props.toolUse?.input?.['-B'] || props.toolUse?.input?.['-C'];
});
const headLimit = computed(() => props.toolUse?.input?.head_limit);

// Whether there are options or flags
const hasSearchOptions = computed(() => {
  return searchPath.value || glob.value || fileType.value || outputMode.value;
});

const hasFlags = computed(() => {
  return caseInsensitive.value || multiline.value || showLineNumbers.value || contextLines.value || headLimit.value;
});

// Parse the search results
const resultFiles = computed(() => {
  if (!props.toolResult?.content) return [];

  const content = props.toolResult.content;

  // If it is a string, parse the file list
  if (typeof content === 'string') {
    const lines = content.split('\n').filter(line => line.trim());
    // Filter out summary lines like "Found X files"
    return lines.filter(line => !line.match(/^Found \d+ files?$/i));
  }

  return [];
});

const fileCount = computed(() => resultFiles.value.length);
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.pattern-text {
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-charts-purple);
  background-color: color-mix(in srgb, var(--vscode-charts-purple) 15%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  font-size: 0.9em;
}

.options-section,
.flags-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.85em;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
  font-size: 0.85em;
}

.detail-label {
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-weight: 500;
}

.options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--vscode-foreground);
}

.option-item .codicon {
  font-size: 12px;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
}

.option-text {
  font-family: var(--vscode-editor-font-family);
}

.flags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flag-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 15%, transparent);
  color: var(--vscode-charts-blue);
  padding: 3px 8px;
  border-radius: 3px;
  font-weight: 500;
}

.flag-tag .codicon {
  font-size: 12px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
