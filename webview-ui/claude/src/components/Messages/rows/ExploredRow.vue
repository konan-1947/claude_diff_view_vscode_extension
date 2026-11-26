<template>
  <div class="cs-step-row">
    <button type="button" class="cs-step" :class="{ open }" :aria-expanded="open" @click="open = !open">
      <span class="cs-step__action">Explored</span>
      <span class="cs-step__details">{{ summary }}</span>
      <span class="codicon codicon-chevron-down cs-step__chevron" />
    </button>
    <div v-if="open" class="explored-lines">
      <div v-for="(l, i) in lines" :key="i" class="explored-line">
        <span class="verb">{{ l.verb }}</span>
        <button v-if="l.path" type="button" class="object link" @click="openFile(l)">{{ l.object }}</button>
        <span v-else class="object">{{ l.object }}</span>
        <span v-if="l.range" class="object">{{ l.range }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ToolContext } from '../../../types/tool';

interface ToolUse {
  name: string;
  input?: any;
}

const props = defineProps<{ tools: ToolUse[]; context?: ToolContext }>();
// Starts closed, also with Ctrl+O's step list shown: a click lists the files
const open = ref(false);

function baseName(p: string) {
  return p.split(/[\\/]/).pop() || p;
}

interface Line {
  verb: string;
  object: string;
  range?: string;
  path?: string;
  start?: number;
  end?: number;
}

const lines = computed<Line[]>(() =>
  props.tools.map((t) => {
    const input = t.input ?? {};
    if (t.name === 'Read') {
      const path = String(input.file_path ?? input.notebook_path ?? '');
      const start = typeof input.offset === 'number' ? input.offset + 1 : undefined;
      const end = typeof input.limit === 'number' ? (input.offset ?? 0) + input.limit : undefined;
      const range = start !== undefined || end !== undefined ? `L${start ?? 1}${end !== undefined ? `-${end}` : ''}` : undefined;
      return { verb: 'Read', object: baseName(path), range, path, start, end };
    }
    if (t.name === 'Glob') return { verb: 'Searched files', object: String(input.pattern ?? '') };
    return { verb: 'Grepped', object: String(input.pattern ?? '') };
  })
);

const summary = computed(() => {
  const files = new Set(lines.value.filter((l) => l.path).map((l) => l.path)).size;
  const searches = lines.value.filter((l) => !l.path).length;
  const parts: string[] = [];
  if (files) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  if (searches) parts.push(`${searches} search${searches === 1 ? '' : 'es'}`);
  return parts.join(', ');
});

function openFile(l: Line) {
  if (!l.path) return;
  props.context?.fileOpener?.open(l.path, { startLine: l.start, endLine: l.end });
}
</script>

<style scoped>
.explored-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.explored-line {
  display: flex;
  gap: 4px;
  min-width: 0;
  font-size: var(--cs-font-size);
  line-height: var(--cs-line-height);
  white-space: nowrap;
}
.verb {
  color: var(--cs-fg-60);
  flex-shrink: 0;
}
.object {
  color: var(--cs-fg-36);
  overflow: hidden;
  text-overflow: ellipsis;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
}
.object.link {
  cursor: pointer;
}
.object.link:hover {
  color: var(--cs-fg-60);
  text-decoration: underline;
  text-decoration-color: var(--cs-fg-36);
  text-underline-offset: 2px;
}
</style>
