<template>
  <div class="text-block">
    <div :class="markdownClasses" v-html="renderedMarkdown" @click="onClick"></div>
    <ImageLightbox :src="zoomImage?.src" :svg="zoomImage?.svg" :alt="zoomImage?.alt" @close="zoomImage = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import type { TextBlock as TextBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';
import { Marked, type Token, type Tokens } from 'marked';
import { cachedMermaid, currentMermaidTheme, mermaidKey, renderMermaid } from '../../../utils/mermaid';
import ImageLightbox from '../../Common/ImageLightbox.vue';
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

// ---- Mermaid: a closed ```mermaid fence is drawn as a diagram ----
// While the fence is still streaming it stays a code block (half a diagram is
// a syntax error); a diagram that fails to render keeps its code, with the error.

/** Bumped when a diagram finishes rendering, to re-run the markdown */
const mermaidVersion = ref(0);
/** Diagrams (by key) the user switched to their source */
const mermaidShowCode = reactive(new Set<string>());
/** Per render: the source and cache key of each diagram, by its data-mermaid index */
let mermaidBlocks: { source: string; key: string }[] = [];
/** Per render: diagrams with no result yet */
let mermaidPending: { source: string; theme: ReturnType<typeof currentMermaidTheme> }[] = [];
let disposed = false;
onUnmounted(() => { disposed = true; });

const MERMAID_TOGGLE = (showCode: boolean) =>
  `<button type="button" class="mermaid-toggle" title="${showCode ? 'Show diagram' : 'Show code'}">` +
  `<span class="codicon ${showCode ? 'codicon-type-hierarchy' : 'codicon-code'}"></span></button>`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isMermaidFence(token: Token): token is Tokens.Code {
  if (token.type !== 'code' || (token as Tokens.Code).codeBlockStyle === 'indented') return false;
  return ((token as Tokens.Code).lang || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid';
}

/** marked closes an unterminated fence at the end of the text: only a closing fence line counts */
function fenceClosed(raw: string): boolean {
  const lines = raw.replace(/\n+$/, '').split('\n');
  return lines.length > 1 && /^ {0,3}(`{3,}|~{3,})\s*$/.test(lines[lines.length - 1]);
}

function mermaidHtml(index: number): string {
  const { source, key } = mermaidBlocks[index];
  const result = cachedMermaid(key);
  const showCode = !result?.svg || mermaidShowCode.has(key);
  const body = showCode
    ? `<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>`
    : `<div class="mermaid-diagram">${result!.svg}</div>`;
  const error = result?.error ? `<div class="mermaid-error">Mermaid: ${escapeHtml(result.error)}</div>` : '';
  const tools = `<div class="code-tools">${result?.svg ? MERMAID_TOGGLE(showCode) : ''}${COPY_BUTTON}</div>`;
  return `<div class="code-block mermaid-block${showCode ? '' : ' is-diagram'}" data-mermaid="${index}">${tools}${body}${error}</div>`;
}

const NARRATION_HINT = '<em class="narration-hint">summary</em>';

/**
 * A narration block (the server's summary of what the model told the user)
 * ends in an italic "summary", as the CLI marks it: on its last line when the
 * text ends in a paragraph, else on a line of its own.
 */
function withNarrationHint(html: string): string {
  const trimmed = html.replace(/\s+$/, '');
  if (trimmed.endsWith('</p>')) return `${trimmed.slice(0, -4)} ${NARRATION_HINT}</p>`;
  return `${html}<p>${NARRATION_HINT}</p>`;
}

// Render Markdown; every code block gets a wrapper holding its copy button
const renderedMarkdown = computed(() => {
  void mermaidVersion.value;
  const tokens = md.lexer(props.block.text);
  const blocks: typeof mermaidBlocks = [];
  const pending: typeof mermaidPending = [];
  let theme: ReturnType<typeof currentMermaidTheme> | undefined;
  md.walkTokens(tokens, token => {
    if (!isMermaidFence(token) || !fenceClosed(token.raw) || !token.text.trim()) return;
    theme ??= currentMermaidTheme();
    const source = token.text;
    const key = mermaidKey(source, theme);
    if (!cachedMermaid(key)) pending.push({ source, theme });
    blocks.push({ source, key });
    // A placeholder, so the <pre> wrapping below leaves the diagram's own markup alone
    Object.assign(token, { type: 'html', block: true, pre: false, text: `<!--mermaid:${blocks.length - 1}-->` });
  });
  mermaidBlocks = blocks;
  mermaidPending = pending;
  const rawHtml = (md.parser(tokens) as string)
    .replace(/<pre>/g, `<div class="code-block">${COPY_BUTTON}<pre>`)
    .replace(/<\/pre>/g, '</pre></div>')
    .replace(/<!--mermaid:(\d+)-->/g, (_, i: string) => mermaidHtml(Number(i)));
  // TODO: sanitize with DOMPurify.sanitize(rawHtml)
  return props.block.narration ? withNarrationHint(rawHtml) : rawHtml;
});

watch(
  renderedMarkdown,
  () => {
    for (const { source, theme } of mermaidPending) {
      void renderMermaid(source, theme).then(() => {
        if (!disposed) mermaidVersion.value++;
      });
    }
  },
  { immediate: true }
);

/** What the zoom viewer shows: an image URL or a diagram's SVG markup */
const zoomImage = ref<{ src?: string; svg?: string; alt?: string } | null>(null);

// Delegated: the buttons live in v-html, and are rebuilt while text streams
async function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const holder = target?.closest<HTMLElement>('.code-block');
  const diagram = holder?.dataset.mermaid != null ? mermaidBlocks[Number(holder.dataset.mermaid)] : undefined;
  // Like the file preview: clicking a drawn diagram or an image opens the zoom viewer
  if (diagram && target?.closest('.mermaid-diagram')) {
    const svg = cachedMermaid(diagram.key)?.svg;
    if (svg) zoomImage.value = { svg };
    return;
  }
  const img = target?.closest('img');
  if (img && img.src && !target?.closest('a[href]')) {
    zoomImage.value = { src: img.currentSrc || img.src, alt: img.alt || undefined };
    return;
  }
  if (diagram && target?.closest('.mermaid-toggle')) {
    if (mermaidShowCode.has(diagram.key)) mermaidShowCode.delete(diagram.key);
    else mermaidShowCode.add(diagram.key);
    return;
  }
  const button = target?.closest<HTMLButtonElement>('.code-copy');
  // marked keeps the fence's last newline; pasted into a shell it would run the command
  const text = diagram ? diagram.source : holder?.querySelector('pre')?.textContent?.replace(/\n$/, '');
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

.markdown-content :deep(.narration-hint) {
  margin-left: 4px;
  color: var(--cs-fg-52);
  font-style: italic;
  user-select: none;
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

/* Mermaid block: the diagram (or its source) with a code/diagram toggle beside Copy */
.markdown-content :deep(.code-tools) {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: flex;
  gap: 2px;
}

.markdown-content :deep(.code-tools .code-copy) {
  position: static;
}

.markdown-content :deep(.mermaid-block pre) {
  /* room for both buttons */
  padding-right: 60px;
}

.markdown-content :deep(.mermaid-toggle) {
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

.markdown-content :deep(.code-block:hover .mermaid-toggle),
.markdown-content :deep(.mermaid-toggle:focus-visible) {
  opacity: 1;
}

.markdown-content :deep(.mermaid-toggle:hover) {
  background-color: var(--cs-fg-12);
  color: var(--vscode-foreground);
}

.markdown-content :deep(.mermaid-diagram) {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  padding: 12px;
  border: 1px solid var(--cs-fg-12);
  border-radius: var(--cs-radius-lg);
}

.markdown-content :deep(.mermaid-diagram svg) {
  max-width: 100%;
  height: auto;
  cursor: zoom-in;
}

.markdown-content :deep(img) {
  cursor: zoom-in;
}

.markdown-content :deep(.mermaid-error) {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--vscode-errorForeground);
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
