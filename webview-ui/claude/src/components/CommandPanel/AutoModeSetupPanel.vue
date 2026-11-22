<template>
  <!-- `/auto-mode-setup`: the CLI's wizard questions as three rows of choices.
       Enter sends `--wizard posture=… scope=… depth=… --propose`; the CLI
       answers with the proposal, and applying it stays the CLI's step. -->
  <CommandPanel
    ref="panelRef"
    title="Auto mode setup"
    :actions="actions"
    :hint="['↑/↓ question', '←/→ answer', 'Enter to propose', 'Esc to cancel']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div class="am-rows">
      <div
        v-for="(question, row) in QUESTIONS"
        :key="question.key"
        :class="['am-row', { active: row === activeRow }]"
        @mousedown.prevent
        @click="activeRow = row"
      >
        <span class="am-label">{{ question.label }}</span>
        <div class="am-options">
          <span
            v-for="(option, col) in question.options"
            :key="option"
            :class="['am-option', { picked: answers[row] === col }]"
            @click.stop="pick(row, col)"
          >{{ option }}</span>
        </div>
      </div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'

const emit = defineEmits<{
  (e: 'run', command: string): void
  (e: 'close'): void
}>()

// Values from the CLI's usage text (2.1.327): `/auto-mode-setup --wizard
// posture=<personal|open-source|enterprise|mixed> scope=<all|project>
// depth=<both|shell|repos|here> --propose`
const QUESTIONS = [
  { key: 'posture', label: 'Posture', options: ['personal', 'open-source', 'enterprise', 'mixed'] },
  { key: 'scope', label: 'Scope', options: ['all', 'project'] },
  { key: 'depth', label: 'Depth', options: ['both', 'shell', 'repos', 'here'] },
] as const

const panelRef = ref<InstanceType<typeof CommandPanel>>()
const activeRow = ref(0)
const answers = ref<number[]>(QUESTIONS.map(() => 0))

function pick(row: number, col: number) {
  activeRow.value = row
  answers.value[row] = col
  panelRef.value?.focus()
}

function move(delta: number) {
  const row = activeRow.value
  const n = QUESTIONS[row].options.length
  answers.value[row] = (answers.value[row] + delta + n) % n
}

function propose() {
  const args = QUESTIONS.map((q, row) => `${q.key}=${q.options[answers.value[row]]}`).join(' ')
  emit('run', `/auto-mode-setup --wizard ${args} --propose`)
  emit('close')
}

function onKey(event: KeyboardEvent) {
  const key = event.key
  let handled = true
  if (key === 'ArrowDown' || key === 'j') activeRow.value = (activeRow.value + 1) % QUESTIONS.length
  else if (key === 'ArrowUp' || key === 'k')
    activeRow.value = (activeRow.value - 1 + QUESTIONS.length) % QUESTIONS.length
  else if (key === 'ArrowRight' || key === 'l') move(1)
  else if (key === 'ArrowLeft' || key === 'h') move(-1)
  else if (key === 'Enter') propose()
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const actions = computed<CommandPanelAction[]>(() => [
  { label: 'Propose', key: '↵', primary: true, run: propose },
])
</script>

<style scoped>
.am-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.am-row.active {
  background: var(--cs-fg-8);
}

.am-label {
  width: 56px;
  flex-shrink: 0;
  color: var(--cs-fg-60);
}

.am-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.am-option {
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--cs-fg-60);
}

.am-option:hover {
  color: var(--cs-fg);
}

.am-option.picked {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}
</style>
