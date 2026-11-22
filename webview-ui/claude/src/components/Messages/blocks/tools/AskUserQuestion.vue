<template>
  <!-- AskUserQuestion in the transcript: one compact line per question,
       "question → answer", instead of the raw input JSON. The full option
       list stays one click away (expand). -->
  <ToolMessageWrapper :tool-result="toolResult" :is-custom-layout="true">
    <template #custom>
      <div class="aq-card">
        <div
          v-for="(q, i) in questions"
          :key="i"
          class="aq-row"
          :class="{ clickable: q.options.length > 0 }"
          @click="toggle(i)"
        >
          <span class="codicon codicon-question aq-icon" />
          <span v-if="q.header" class="aq-chip">{{ q.header }}</span>
          <span class="aq-q">{{ q.question }}</span>
          <span class="codicon codicon-arrow-right aq-arrow" />
          <span :class="['aq-a', state]">{{ answerFor(q.question) }}</span>
          <span
            v-if="q.options.length"
            class="codicon codicon-chevron-right aq-chevron"
            :class="{ open: openRows.has(i) }"
          />
          <div v-if="openRows.has(i)" class="aq-options" @click.stop>
            <span
              v-for="o in q.options"
              :key="o.label"
              :class="['aq-option', { picked: isPicked(q.question, o.label) }]"
              :title="o.description"
            >
              {{ o.label }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

interface Question {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
}

const props = defineProps<Props>();

const questions = computed<Question[]>(() => {
  const raw = props.toolUse?.input?.questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q: any) => q && typeof q.question === 'string')
    .map((q: any) => ({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : undefined,
      options: Array.isArray(q.options) ? q.options.filter((o: any) => o && typeof o.label === 'string') : [],
    }));
});

function resultText(): string {
  const content = props.toolResult?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).join('\n');
  }
  return '';
}

/** Answers keyed by question text: structured result first, else the result text
 *  (`"question"="answer"` pairs, as the CLI writes it). */
const answers = computed<Record<string, string>>(() => {
  const structured = props.toolUseResult?.answers ?? props.toolUse?.input?.answers;
  if (structured && typeof structured === 'object') return structured;
  const out: Record<string, string> = {};
  const re = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g;
  const text = resultText();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out[m[1]] = m[2];
  return out;
});

const state = computed<'pending' | 'declined' | 'answered'>(() => {
  if (!props.toolResult) return 'pending';
  if (props.toolResult.is_error) return 'declined';
  return 'answered';
});

function answerFor(question: string): string {
  if (state.value === 'pending') return 'Waiting for answer…';
  if (state.value === 'declined') return 'Declined';
  return answers.value[question] || 'No answer';
}

function isPicked(question: string, label: string): boolean {
  const a = answers.value[question];
  return !!a && a.split(', ').includes(label);
}

const openRows = ref(new Set<number>());

function toggle(i: number) {
  if (!questions.value[i]?.options.length) return;
  const next = new Set(openRows.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  openRows.value = next;
}
</script>

<style scoped>
.aq-card {
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
  border-radius: 12px;
  background: var(--vscode-editor-background);
  overflow: hidden;
}

.aq-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 6px;
  row-gap: 4px;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}

.aq-row + .aq-row {
  border-top: 1px solid var(--cs-fg-12);
}

.aq-row.clickable {
  cursor: pointer;
}

.aq-icon,
.aq-arrow {
  flex-shrink: 0;
  color: var(--cs-fg-52);
  font-size: 14px;
}

.aq-arrow {
  font-size: 12px;
}

.aq-chip {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--cs-fg-14);
  font-size: 11px;
  line-height: 18px;
}

.aq-q {
  min-width: 0;
  color: var(--cs-fg-74);
  overflow-wrap: anywhere;
}

.aq-a {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.aq-a.pending,
.aq-a.declined {
  font-weight: normal;
  font-style: italic;
  color: var(--cs-fg-52);
}

.aq-chevron {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--cs-fg-52);
  transition: transform 0.15s ease;
}

.aq-chevron.open {
  transform: rotate(90deg);
}

.aq-options {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 20px;
  cursor: default;
}

.aq-option {
  padding: 0 8px;
  border: 1px solid var(--cs-fg-14);
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  color: var(--cs-fg-66);
}

.aq-option.picked {
  border-color: var(--vscode-focusBorder);
  color: var(--cs-fg);
  background: color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
}
</style>
