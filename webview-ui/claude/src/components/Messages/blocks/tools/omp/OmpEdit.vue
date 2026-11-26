<template>
  <ToolMessageWrapper
    tool-icon="codicon-edit"
    tool-name="edit"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-diff-view': hasDiffView }"
  >
    <template v-if="singleFile && files[0]" #icon>
      <FileIcon :file-name="files[0]" :size="16" />
    </template>

    <template #main>
      <ToolFilePath v-if="singleFile && files[0]" :file-path="files[0]" :context="context" :opens-file="false" />
      <div v-else-if="files.length > 1" class="file-paths">
        <ToolFilePath
          v-for="file in files"
          :key="file"
          :file-path="file"
          :context="context"
          :opens-file="false"
        />
      </div>
      <span v-else class="tool-label">edit</span>
      <span v-if="stats" class="diff-stats">
        <span v-if="stats.added > 0" class="stat-add">+{{ stats.added }}</span>
        <span v-if="stats.removed > 0" class="stat-remove">-{{ stats.removed }}</span>
      </span>
    </template>

    <template #expandable>
      <!-- Structured diff (details.diff / details.perFileResults) -->
      <div v-if="diffBlocks.length" class="diff-view">
        <template v-for="(block, blockIndex) in diffBlocks" :key="blockIndex">
          <div class="diff-file-header">
            <FileIcon :file-name="block.path || 'diff'" :size="16" />
            <span class="file-name">{{ basename(block.path) || 'diff' }}</span>
          </div>
          <div class="diff-lines">
            <div
              v-for="(row, rowIndex) in block.rows"
              :key="rowIndex"
              class="diff-line"
              :class="rowClass(row)"
            >
              <span class="line-number">{{ row.number }}</span>
              <span class="line-prefix">{{ rowPrefix(row) }}</span>
              <span class="line-content">{{ row.text }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- No structured diff yet: raw hashline patch or replace-mode pair -->
      <div v-else-if="rawPatchRows.length" class="patch-block">
        <div
          v-for="(line, lineIndex) in rawPatchRows"
          :key="lineIndex"
          class="patch-line"
          :class="patchLineClass(line)"
        >{{ line || ' ' }}</div>
      </div>

      <template v-if="resultText && !isError">
        <div class="section-header">Result</div>
        <pre class="output-block">{{ resultText }}</pre>
      </template>

      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FileIcon from '@/components/FileIcon.vue';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from '../common/ToolMessageWrapper.vue';
import ToolError from '../common/ToolError.vue';
import ToolFilePath from '../common/ToolFilePath.vue';
import { toolResultText } from '../common/codeModeResult';
import {
  asText,
  diffStats,
  hashlineAddedCount,
  hashlinePaths,
  isHashlineHeader,
  isHashlineOp,
  parseDiffRows,
  pathBasename,
  replacePatchLines,
  splitLines,
  type DiffRow,
} from './ompDiff';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

interface DiffFile {
  path: string;
  diff: string;
}

interface DiffBlock {
  path: string;
  rows: DiffRow[];
}

const input = computed<any>(() => props.toolUse?.input ?? {});
const details = computed<any>(() => props.toolUseResult ?? {});
const isError = computed<boolean>(() => !!props.toolResult?.is_error);
const resultText = computed<string>(() => toolResultText(props.toolResult));

// Hashline mode: the whole patch is a single `input` string
const patch = computed<string>(() => asText(input.value.input));

// Replace mode: `{path, old_string, new_string}` (model-dependent)
const replaceMode = computed<boolean>(() => {
  if (patch.value) return false;
  return (
    typeof input.value.path === 'string' &&
    (typeof input.value.old_string === 'string' || typeof input.value.new_string === 'string')
  );
});

const diffFiles = computed<DiffFile[]>(() => {
  if (isError.value) return [];
  const per = details.value?.perFileResults;
  if (Array.isArray(per)) {
    const perFiles = per
      .filter((file: any) => file && typeof file.diff === 'string')
      .map((file: any): DiffFile => ({
        path: asText(file.path),
        diff: file.diff as string,
      }));
    if (perFiles.length > 0) return perFiles;
  }
  if (typeof details.value?.diff === 'string') {
    return [{ path: asText(details.value.path), diff: details.value.diff as string }];
  }
  return [];
});

const diffBlocks = computed<DiffBlock[]>(() =>
  diffFiles.value.map((file: DiffFile): DiffBlock => ({
    path: file.path,
    rows: parseDiffRows(file.diff),
  }))
);

const files = computed<string[]>(() => {
  const fromDiff = diffFiles.value.map((file: DiffFile) => file.path).filter(Boolean);
  if (fromDiff.length) return fromDiff;
  const detailPath = asText(details.value?.path);
  if (detailPath) return [detailPath];
  if (replaceMode.value) return [asText(input.value.path)];
  return hashlinePaths(patch.value);
});

const singleFile = computed<boolean>(() => files.value.length === 1);
const hasDiffView = computed<boolean>(() => diffBlocks.value.length > 0);

const stats = computed<{ added: number; removed: number } | null>(() => {
  if (diffBlocks.value.length) {
    let added = 0;
    let removed = 0;
    for (const file of diffFiles.value) {
      const counts = diffStats(file.diff);
      added += counts.added;
      removed += counts.removed;
    }
    if (added > 0 || removed > 0) return { added, removed };
  }
  if (replaceMode.value) {
    return {
      added: splitLines(asText(input.value.new_string)).length,
      removed: splitLines(asText(input.value.old_string)).length,
    };
  }
  if (patch.value) {
    return { added: hashlineAddedCount(patch.value), removed: 0 };
  }
  return null;
});

const rawPatchRows = computed<string[]>(() => {
  if (diffBlocks.value.length) return [];
  if (patch.value) return splitLines(patch.value);
  if (replaceMode.value) {
    return replacePatchLines(asText(input.value.old_string), asText(input.value.new_string));
  }
  return [];
});

const shouldExpand = computed<boolean>(() => isError.value);

function basename(filePath: string): string {
  return pathBasename(filePath);
}

function rowClass(row: DiffRow): string {
  if (row.kind === 'add') return 'diff-line-add';
  if (row.kind === 'delete') return 'diff-line-delete';
  return 'diff-line-context';
}

function rowPrefix(row: DiffRow): string {
  if (row.kind === 'add') return '+';
  if (row.kind === 'delete') return '-';
  return ' ';
}

function patchLineClass(line: string): string {
  if (isHashlineHeader(line)) return 'patch-header';
  if (isHashlineOp(line)) return 'patch-op';
  if (line.startsWith('+')) return 'patch-add';
  if (line.startsWith('-')) return 'patch-remove';
  return '';
}
</script>

<style scoped>
/* The diff owns the expansion surface; drop the wrapper's inset padding/clamp */
.has-diff-view :deep(.expandable-content) {
  padding: 0;
  max-height: none;
  overflow: visible;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.file-paths {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  white-space: normal;
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
  max-height: 400px;
  overflow: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: 0.5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.diff-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
}

.diff-lines {
  width: max-content;
  min-width: 100%;
}

.diff-line {
  display: flex;
  height: 22px;
  line-height: 22px;
  white-space: pre;
}

.line-number {
  width: 44px;
  flex-shrink: 0;
  padding: 0 8px;
  text-align: right;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

.line-prefix {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  user-select: none;
}

.line-content {
  flex: 1;
  padding-right: 8px;
  white-space: pre;
}

.diff-line-delete {
  background-color: color-mix(
    in srgb,
    var(--vscode-gitDecoration-deletedResourceForeground) 20%,
    transparent
  );
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(
    in srgb,
    var(--vscode-gitDecoration-deletedResourceForeground) 25%,
    transparent
  );
}

.diff-line-delete .line-content {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(
    in srgb,
    var(--vscode-gitDecoration-addedResourceForeground) 20%,
    transparent
  );
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(
    in srgb,
    var(--vscode-gitDecoration-addedResourceForeground) 25%,
    transparent
  );
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

.patch-block {
  max-height: 400px;
  overflow: auto;
  padding: 8px 10px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 85%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
}

.patch-line {
  white-space: pre;
}

.patch-header {
  font-weight: 700;
  color: var(--vscode-foreground);
}

.patch-op {
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
}

.patch-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.patch-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.section-header {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-size: 0.85em;
  margin: 8px 0 4px;
  font-weight: 500;
}

.output-block {
  margin: 0;
  max-height: 200px;
  overflow: auto;
  padding: 8px 12px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 85%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
}
</style>
