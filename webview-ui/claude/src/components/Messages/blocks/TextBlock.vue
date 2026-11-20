<template>
  <div class="text-block">
    <div :class="markdownClasses" v-html="renderedMarkdown"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TextBlock as TextBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';
import { marked } from 'marked';
// import DOMPurify from 'dompurify'; // TODO: enable once installed

interface Props {
  block: TextBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

// Markdown class name
const markdownClasses = computed(() => {
  const classes = ['markdown-content'];
  if (props.block.isSlashCommand) {
    classes.push('slash-command-text');
  }
  return classes;
});

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Render Markdown
const renderedMarkdown = computed(() => {
  const rawHtml = marked.parse(props.block.text) as string;
  // TODO: sanitize with DOMPurify.sanitize(rawHtml)
  return rawHtml;
});
</script>

<style scoped>
.text-block {
  margin: 0;
  padding: 0 16px;
}

.markdown-content {
  font-size: 14px;
  line-height: 22px;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  user-select: text;
}

.slash-command-text {
  color: var(--vscode-textLink-foreground);
  font-weight: 600;
}

/* Markdown base styles - Claudex style */
/* Cursor: blocks are spaced 16px apart (space-y-4), none above the first */
.markdown-content :deep(p) {
  margin: 0;
  line-height: 22px;
}

.markdown-content > :deep(* + *) {
  margin-top: 16px;
}

.markdown-content :deep(code) {
  font-family: var(--vscode-editor-font-family, 'Hack Nerd Font Mono', 'SF Mono', Consolas, 'Courier New', monospace);
  word-break: break-all;
  cursor: default;
}

.markdown-content :deep(pre) {
  background-color: var(--cs-fg-8);
  border: 1px solid var(--cs-fg-12);
  border-radius: var(--cs-radius-lg);
  padding: 8px 10px;
  margin: 0;
  overflow-x: auto;
  font-size: 12px;
  line-height: 20px;
}

.markdown-content :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
}

.markdown-content :deep(:not(pre) > code) {
  background-color: var(--cs-fg-8);
  border: none;
  border-radius: 5px;
  padding: 1.5px 2px;
  font-size: 12.6px;
}

.markdown-content :deep(a) {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0px 0px 0px 16px;
  padding: 0px;
}

.markdown-content :deep(li) {
  padding-top: 2px;
  padding-bottom: 2px;
  list-style-type: disc;
}

.markdown-content :deep(blockquote) {
  border-left: 2px solid var(--cs-fg-20);
  background: none;
  margin: 0;
  padding: 0 12px;
  color: var(--cs-fg-66);
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--vscode-foreground);
  font-weight: 600;
  margin: 0;
  line-height: 1.4;
}

.markdown-content :deep(h1) {
  font-size: 18px;
}

.markdown-content :deep(h2) {
  font-size: 16px;
}

.markdown-content :deep(h3) {
  font-size: 14px;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 0;
  width: 100%;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--cs-fg-12);
  padding: 6px 10px;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 30%, transparent);
  font-weight: 600;
}
</style>
