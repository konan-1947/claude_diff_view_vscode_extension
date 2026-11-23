<template>
  <div class="turn">
    <UserMessage v-if="turn.user" :message="turn.user" :context="context" />

    <div v-if="rows.length" class="turn-body">
      <!-- "Worked for 9s": folds every step of the turn into one line -->
      <div v-if="hasWork" class="turn-row">
        <button
          type="button"
          class="cs-step"
          :class="{ open: expanded }"
          :aria-expanded="expanded"
          @click="toggle"
        >
          <span class="cs-step__action">{{ finished ? 'Worked' : 'Working' }}</span>
          <span v-if="finished" class="cs-step__action">for {{ duration }}</span>
          <span class="codicon codicon-chevron-down cs-step__chevron" />
        </button>
      </div>

      <template v-for="row in visibleRows" :key="row.key">
        <div v-if="row.kind === 'thought'" class="turn-row">
          <ThoughtRow :text="row.text" />
        </div>
        <div v-else-if="row.kind === 'explore'" class="turn-row">
          <ExploredRow :tools="row.tools" :context="context" />
        </div>
        <div v-else-if="row.kind === 'tool'" class="turn-row">
          <ContentBlock :block="row.block" :wrapper="row.wrapper" :context="context" />
        </div>
        <div v-else class="turn-row">
          <ContentBlock :block="row.block" :wrapper="row.wrapper" :context="context" />
        </div>
      </template>

      <div v-if="finished && finalText" class="turn-row turn-actions">
        <button type="button" class="icon-btn" :title="copied ? 'Copied' : 'Copy message'" @click="copy">
          <span class="codicon" :class="copied ? 'codicon-check' : 'codicon-copy'" />
        </button>
        <span class="ago">{{ ago }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Turn } from '../../utils/turns';
import { formatAgo, formatDuration } from '../../utils/turns';
import type { ToolContext } from '../../types/tool';
import type { ContentBlockType } from '../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../models/ContentBlockWrapper';
import UserMessage from './UserMessage.vue';
import ContentBlock from './ContentBlock.vue';
import ThoughtRow from './rows/ThoughtRow.vue';
import ExploredRow from './rows/ExploredRow.vue';

interface Props {
  turn: Turn;
  context: ToolContext;
  /** Steps start unfolded (the turn that is being worked on, or just finished) */
  defaultOpen?: boolean;
  /** The assistant is still producing this turn */
  running?: boolean;
}

const props = withDefaults(defineProps<Props>(), { defaultOpen: false, running: false });

type Row =
  | { kind: 'thought'; key: string; text: string }
  | { kind: 'explore'; key: string; tools: { name: string; input?: any }[] }
  | { kind: 'tool'; key: string; block: ContentBlockType; wrapper?: ContentBlockWrapper }
  | { kind: 'text'; key: string; block: ContentBlockType; wrapper?: ContentBlockWrapper }
  | { kind: 'other'; key: string; block: ContentBlockType; wrapper?: ContentBlockWrapper };

const EXPLORE_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const PLAN_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

// Plan files of this turn: the ExitPlanMode card already shows the plan, so the
// Write/Edit that produced the file would only repeat it
const planFiles = computed(() => {
  const out = new Set<string>();
  for (const msg of props.turn.assistant) {
    const content = msg.message.content;
    if (typeof content === 'string') continue;
    for (const w of content) {
      const b = w.content as any;
      if (b.type === 'tool_use' && b.name === 'ExitPlanMode' && typeof b.input?.planFilePath === 'string') {
        out.add(normPath(b.input.planFilePath));
      }
    }
  }
  return out;
});

function isPlanFileWrite(b: any): boolean {
  if (!PLAN_WRITE_TOOLS.has(b.name)) return false;
  const fp = b.input?.file_path;
  if (typeof fp !== 'string') return false;
  const n = normPath(fp);
  return planFiles.value.has(n) || n.includes('/.claude/plans/');
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  props.turn.assistant.forEach((msg, mi) => {
    const content = msg.message.content;
    const items: { block: ContentBlockType; wrapper?: ContentBlockWrapper }[] =
      typeof content === 'string'
        ? [{ block: { type: 'text', text: content } as ContentBlockType }]
        : content.map((w) => ({ block: w.content, wrapper: w }));

    items.forEach(({ block, wrapper }, bi) => {
      const key = `${mi}:${bi}`;
      if (block.type === 'thinking') {
        out.push({ kind: 'thought', key, text: (block as any).thinking ?? '' });
      } else if (block.type === 'tool_use') {
        const b = block as any;
        if (isPlanFileWrite(b)) {
          return;
        } else if (EXPLORE_TOOLS.has(b.name)) {
          const last = out[out.length - 1];
          if (last && last.kind === 'explore') last.tools.push({ name: b.name, input: b.input });
          else out.push({ kind: 'explore', key, tools: [{ name: b.name, input: b.input }] });
        } else {
          out.push({ kind: 'tool', key, block, wrapper });
        }
      } else if (block.type === 'text') {
        out.push({ kind: 'text', key, block, wrapper });
      } else if (block.type !== 'tool_result') {
        out.push({ kind: 'other', key, block, wrapper });
      }
    });
  });
  return out;
});

const hasWork = computed(() => rows.value.some((r) => r.kind === 'thought' || r.kind === 'explore' || r.kind === 'tool'));
const lastTextIndex = computed(() => {
  for (let i = rows.value.length - 1; i >= 0; i--) if (rows.value[i].kind === 'text') return i;
  return -1;
});
const finalText = computed(() => {
  const r = rows.value[lastTextIndex.value];
  return r && r.kind === 'text' ? ((r.block as any).text as string) : '';
});

const override = ref<boolean | undefined>(undefined);
const expanded = computed(() => (hasWork.value ? override.value ?? props.defaultOpen : true));
function toggle() {
  override.value = !expanded.value;
}
// A turn that starts running unfolds itself; the user's own toggle still wins afterwards
watch(
  () => props.running,
  (r) => {
    if (r) override.value = undefined;
  }
);

const visibleRows = computed(() => {
  if (expanded.value) return rows.value;
  return rows.value.filter((r, i) => r.kind === 'other' || (r.kind === 'text' && i === lastTextIndex.value));
});

const finished = computed(() => !props.running);
const duration = computed(() => formatDuration(props.turn.endedAt - props.turn.startedAt));
const ago = computed(() => formatAgo(props.turn.endedAt));

const copied = ref(false);
async function copy() {
  const text = finalText.value;
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
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
</script>

<style scoped>
.turn {
  display: flex;
  flex-direction: column;
  gap: var(--cs-row-gap);
}

.turn-body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-row-gap);
  padding: 0 calc(var(--cs-edge) + var(--cs-row-inset));
  font-size: var(--cs-font-size);
  line-height: var(--cs-line-height);
}

.turn-row {
  min-width: 0;
}

/* Rows bring no gutter of their own here (the turn body already insets them) */
.turn-row :deep(.text-block) {
  padding: 0;
}
.turn-row :deep(.thinking-block) {
  margin: 0;
}
.turn-row :deep(.tool-message-wrapper.is-card) {
  margin: 0;
}

.turn-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: -4px;
}

.turn-actions .icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--cs-fg-52);
  cursor: pointer;
  transition: background-color var(--cs-duration) ease, color var(--cs-duration) ease;
}
.turn-actions .icon-btn:hover {
  background: var(--cs-fg-8);
  color: var(--cs-fg-74);
}
.turn-actions .icon-btn .codicon {
  font-size: 13px;
}

.ago {
  font-size: 12px;
  line-height: 18px;
  color: var(--cs-fg-60);
  padding-left: 6px;
}
</style>
