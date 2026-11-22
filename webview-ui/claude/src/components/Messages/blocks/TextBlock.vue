<template>
  <div class="text-block">
    <div :class="markdownClasses" v-html="renderedMarkdown" @click="onClick"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TextBlock as TextBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';
import { Marked } from 'marked';
// import DOMPurify from 'dompurify'; // TODO: enable once installed

// Own instance: the renderer overrides below need this component's CSS, so
// they must not leak into the other places that use the global `marked`.
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // A single newline is a line break (breaks: true), which the model uses
    // between sentences it means as separate lines: a block spacer gives them
    // a small gap instead of sitting flush like wrapped lines of one sentence.
    br() {
      return '<span class="md-br"></span>';
    },
  },
});

const COPY_BUTTON =
  '<button type="button" class="code-copy" title="Copy"><span class="codicon codicon-copy"></span></button>';

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

// Render Markdown; every code block gets a wrapper holding its copy button
const renderedMarkdown = computed(() => {
  const rawHtml = (md.parse(props.block.text) as string)
    .replace(/<pre>/g, `<div class="code-block">${COPY_BUTTON}<pre>`)
    .replace(/<\/pre>/g, '</pre></div>');
  // TODO: sanitize with DOMPurify.sanitize(rawHtml)
  return rawHtml;
});

// Delegated: the buttons live in v-html, and are rebuilt while text streams
async function onClick(event: MouseEvent) {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.code-copy');
  // marked keeps the fence's last newline; pasted into a shell it would run the command
  const text = button?.parentElement?.querySelector('pre')?.textContent?.replace(/\n$/, '');
  if (!button || text == null) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const icon = button.querySelector('.codicon');
  icon?.classList.replace('codicon-copy', 'codicon-check');
  button.title = 'Copied';
  setTimeout(() => {
    icon?.classList.replace('codicon-check', 'codicon-copy');
    button.title = 'Copy';
  }, 1200);
}
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

/* Class doubled on purpose: the element rules below (`p`, `ul`, `h1`...)
   reset margin to 0 with a higher specificity (0,2,1 vs 0,2,0), which used to
   cancel this spacing for every block except code. */
.markdown-content.markdown-content > :deep(* + *) {
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
  /* right: room for the copy button, so wrapped text never runs under it */
  padding: 8px 34px 8px 10px;
  margin: 0;
  /* wrap long lines (commands, paths) instead of scrolling sideways */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 20px;
}

.markdown-content :deep(.md-br) {
  display: block;
  height: 6px;
}

.markdown-content :deep(.code-block) {
  position: relative;
}

/* Inside a list item or quote the block sits between lines of text, where
   the top-level 16px spacing does not reach */
.markdown-content :deep(li .code-block),
.markdown-content :deep(blockquote .code-block) {
  margin: 8px 0;
}

.markdown-content :deep(.code-copy) {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg-52);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}

.markdown-content :deep(.code-block:hover .code-copy),
.markdown-content :deep(.code-copy:focus-visible) {
  opacity: 1;
}

.markdown-content :deep(.code-copy:hover) {
  background-color: var(--cs-fg-12);
  color: var(--vscode-foreground);
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

/* Marker type belongs to the list, not the item: a numbered list keeps its
   numbers and a nested list reads as a sub-level. */
.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ul ul) {
  list-style-type: circle;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
  /* room for two-digit numbers */
  margin-left: 20px;
}

.markdown-content :deep(li) {
  padding-top: 2px;
  padding-bottom: 2px;
}

.markdown-content :deep(li)::marker {
  color: var(--cs-fg-52);
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

/* A table wider than the pane (side bar) scrolls on its own instead of being
   cut off by the transcript, which hides horizontal overflow */
.markdown-content :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 0;
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
