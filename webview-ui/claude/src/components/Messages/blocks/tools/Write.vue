<template>
  <ToolMessageWrapper
    tool-icon="codicon-new-file"
    tool-name="Write"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-content-view': hasContentView }"
  >
    <template #main>
      <span class="tool-label">Write</span>
      <ToolFilePath v-if="filePath" :file-path="filePath" :context="context" />
      <span v-if="contentStats" class="content-stats">
        <span class="stat-lines">{{ contentStats.lines }} Lines </span>
        <span class="stat-chars">{{ contentStats.chars }} Chars </span>
      </span>
    </template>

    <template #expandable>
      <!-- File content view -->
      <div v-if="content && !toolResult?.is_error" class="write-view">
        <!-- File title bar -->
        <div v-if="filePath" class="write-file-header">
          <FileIcon :file-name="filePath" :size="16" class="file-icon" />
          <span class="file-name">{{ fileName }}</span>
        </div>

        <!-- Content display -->
        <div class="write-scroll-container">
          <!-- Left line number column -->
          <div ref="lineNumbersRef" class="write-line-numbers">
            <div
              v-for="n in lineCount"
              :key="n"
              class="line-number-item"
            >
              {{ n }}
            </div>
          </div>

          <!-- Right content column -->
          <div ref="contentRef" class="write-content" @scroll="handleContentScroll">
            <pre class="content-text">{{ content }}</pre>
          </div>
        </div>
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import FileIcon from '@/components/FileIcon.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

// vcc-re data source: inputs only
const filePath = computed(() => {
  return props.toolUse?.input?.file_path || '';
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

// Get the file content from inputs.content
const content = computed(() => {
  return props.toolUse?.input?.content || '';
});

// Content stats
const contentStats = computed(() => {
  if (!content.value) return null;

  const lines = content.value.split('\n').length;
  const chars = content.value.length;

  return { lines, chars };
});

// Line count
const lineCount = computed(() => {
  if (!content.value) return 0;
  return content.value.split('\n').length;
});

// Whether there is a content view
const hasContentView = computed(() => {
  return !!content.value && !props.toolResult?.is_error;
});

// Whether this is the permission request phase
const isPermissionRequest = computed(() => {
  // No result, or a non-error result = permission request or running
  return !props.toolResult || !props.toolResult.is_error;
});

// Expand during the permission request phase
const shouldExpand = computed(() => {
  return hasContentView.value && isPermissionRequest.value;
});

// DOM refs
const lineNumbersRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();

// Sync vertical scrolling of the line number and content columns
function handleContentScroll() {
  if (lineNumbersRef.value && contentRef.value) {
    lineNumbersRef.value.scrollTop = contentRef.value.scrollTop;
  }
}
</script>

<style scoped>
/* With a content view, remove the left border and margin; errors keep the default style */
.has-content-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.content-stats {
  display: flex;
  gap: 8px;
  margin-left: 8px;
  font-size: 0.8em;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
}

.stat-lines,
.stat-chars {
  font-family: var(--vscode-editor-font-family);
}

.write-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: 0.5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.write-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.write-file-header :deep(.mdi),
.write-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.write-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
}

.write-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* Left line number column */
.write-line-numbers {
  width: 50px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-right: 1px solid var(--vscode-panel-border);
}

.line-number-item {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: right;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

/* Right content column */
.write-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco-style scrollbar (content column only) */
.write-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.write-content::-webkit-scrollbar-track {
  background: transparent;
}

.write-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.write-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.write-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.write-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.write-content::-webkit-scrollbar-corner {
  background: transparent;
}

.content-text {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  line-height: 22px;
  margin: 0;
  padding: 0 8px 0 4px;
  white-space: pre;
  min-width: 100%;
  width: fit-content;
}
</style>
