<template>
  <ToolMessageWrapper
    tool-icon="codicon-edit"
    tool-name="MultiEdit"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-diff-view': hasDiffView }"
  >
    <template #icon>
      <FileIcon v-if="filePath" :file-name="filePath" :size="16" />
    </template>

    <template #main>
      <ToolFilePath v-if="filePath" :file-path="filePath" :context="context" />
      <span v-if="diffStats" class="diff-stats">
        <span v-if="diffStats.added > 0" class="stat-add">+{{ diffStats.added }}</span>
        <span v-if="diffStats.removed > 0" class="stat-remove">-{{ diffStats.removed }}</span>
      </span>
    </template>

    <!-- Expanded content: diff view -->
    <template #expandable>
      <!-- Replace option -->
      <div v-if="replaceAll" class="replace-option">
        <span class="codicon codicon-replace-all"></span>
        <span>Replace all</span>
      </div>

      <!-- Diff view -->
      <div v-if="structuredPatch && structuredPatch.length > 0" class="diff-view">
        <!-- File title bar -->
        <div v-if="filePath" class="diff-file-header">
          <FileIcon :file-name="filePath" :size="16" />
          <span class="file-name">{{ fileName }}</span>
        </div>
        <!-- Two-column diff layout: line numbers + content -->
        <div class="diff-scroll-container">
          <!-- Left: line number column -->
          <div ref="lineNumbersRef" class="diff-line-numbers">
            <div v-for="(patch, index) in structuredPatch" :key="index">
              <div
                v-for="(line, lineIndex) in patch.lines"
                :key="lineIndex"
                class="line-number-item"
                :class="getDiffLineClass(line)"
              >
                {{ getLineNumber(patch, lineIndex as number) }}
              </div>
            </div>
          </div>

          <!-- Right: content column (scrollable) -->
          <div ref="contentRef" class="diff-content" @scroll="handleContentScroll">
            <div v-for="(patch, index) in structuredPatch" :key="index" class="diff-block">
              <div class="diff-lines">
                <div
                  v-for="(line, lineIndex) in patch.lines"
                  :key="lineIndex"
                  class="diff-line"
                  :class="getDiffLineClass(line)"
                >
                  <span class="line-prefix">{{ getLinePrefix(line) }}</span>
                  <span class="line-content">{{ getLineContent(line) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Error content -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import path from 'path-browserify-esm';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import type { ToolContext } from '@/types/tool';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import { generateLinePatch } from '@/utils/linePatch';
import FileIcon from '@/components/FileIcon.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

const filePath = computed(() => {
  return props.toolUse?.input?.file_path || props.toolUse?.input?.notebook_path;
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

const replaceAll = computed(() => {
  return props.toolUse?.input?.replace_all;
});

// Store structuredPatch in a ref, updated via watch
const structuredPatch = ref<any>(null);

// Watch props and update structuredPatch
watch(
  () => [props.toolUseResult, props.toolUse, props.toolResult],
  () => {
    // No diff when there is an error
    if (props.toolResult?.is_error) {
      structuredPatch.value = null;
      return;
    }

    // Prefer structuredPatch from toolUseResult (the real diff returned after execution)
    if (props.toolUseResult?.structuredPatch) {
      structuredPatch.value = props.toolUseResult.structuredPatch;
    }
    // If there is input, build a temporary diff (permission request phase, or kept after a live run finishes)
    else if (props.toolUse?.input?.old_string && props.toolUse?.input?.new_string) {
      structuredPatch.value = generateLinePatch(
        props.toolUse.input.old_string,
        props.toolUse.input.new_string
      );
    }
  },
  { immediate: true, deep: true }
);

const hasDiffView = computed(() => {
  return structuredPatch.value && structuredPatch.value.length > 0;
});

// Whether this is the permission request phase (temporary diff from input)
const isPermissionRequest = computed(() => {
  return !props.toolUseResult && props.toolUse?.input?.old_string && props.toolUse?.input?.new_string;
});

// Expanded by default only during the permission request phase, collapsed once done
const shouldExpand = computed(() => {
  return hasDiffView.value;
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

// Compute diff stats
const diffStats = computed(() => {
  if (!structuredPatch.value) return null;

  let added = 0;
  let removed = 0;

  structuredPatch.value.forEach((patch: any) => {
    patch.lines.forEach((line: string) => {
      if (line.startsWith('+')) added++;
      if (line.startsWith('-')) removed++;
    });
  });

  return { added, removed };
});

// Get the type class name of a diff line
function getDiffLineClass(line: string): string {
  if (line.startsWith('-')) return 'diff-line-delete';
  if (line.startsWith('+')) return 'diff-line-add';
  return 'diff-line-context';
}

// Get the line prefix
function getLinePrefix(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line[0];
  }
  return ' ';
}

// Get the line content (without the prefix)
function getLineContent(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line.substring(1);
  }
  return line;
}

// Compute line numbers (removed lines show the old number, added lines the new one)
function getLineNumber(patch: any, lineIndex: number): string {
  const currentLine = patch.lines[lineIndex];

  if (currentLine.startsWith('-')) {
    // Removed line: show the old line number
    let oldLine = patch.oldStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('+')) {
        oldLine++;
      }
    }
    return String(oldLine);
  } else if (currentLine.startsWith('+')) {
    // Added line: show the new line number
    let newLine = patch.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  } else {
    // Context line: show the new line number
    let newLine = patch.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  }
}
</script>

<style scoped>
/* With a diff view, remove the left border and margin; errors keep the default style */
.has-diff-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}


.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.diff-stats {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  font-size: 0.85em;
  font-weight: 500;
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  overflow: hidden;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.diff-file-header :deep(.mdi),
.diff-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.diff-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
}

.diff-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* Left line number column */
.diff-line-numbers {
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
.diff-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco-style scrollbar (content column only) */
.diff-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.diff-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.diff-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.diff-content::-webkit-scrollbar-corner {
  background: transparent;
}

.diff-block {
  width: 100%;
  padding-right: 14px;
}

.diff-lines {
  background-color: var(--vscode-editor-background);
  width: fit-content;
  min-width: 100%;
}

.diff-line {
  display: flex;
  font-family: var(--vscode-editor-font-family);
  white-space: nowrap;
  height: 22px;
  line-height: 22px;
}

.line-prefix {
  display: inline-block;
  width: 20px;
  text-align: center;
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px 0 4px;
  white-space: pre;
}

.diff-line-delete {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
}

.diff-line-delete .line-content {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
}

.diff-line-add .line-content {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line-context {
  background-color: var(--vscode-editor-background);
}

.diff-line-context .line-prefix {
  color: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
}

.diff-line-context .line-content {
  color: var(--vscode-editor-foreground);
}

.replace-option {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--vscode-charts-orange);
  font-size: 0.85em;
  font-weight: 500;
  padding: 4px 0;
}

.replace-option .codicon {
  font-size: 12px;
}
</style>
