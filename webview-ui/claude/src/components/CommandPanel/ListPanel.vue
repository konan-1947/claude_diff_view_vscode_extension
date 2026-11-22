<template>
  <!-- Pick one entry from a list, like the CLI's menus: ↑/↓ (or j/k, digits)
       to move, Enter to pick. The current entry is marked with a check. -->
  <CommandPanel
    :title="title"
    :actions="actions"
    :hint="hint.length ? hint : ['↑/↓ to select', 'Enter to confirm', 'Esc to cancel']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div v-if="loading" class="lp-empty">Loading…</div>
    <div v-else-if="items.length === 0" class="lp-empty">{{ emptyText }}</div>
    <div v-else class="lp-list" role="listbox">
      <div
        v-for="(item, i) in items"
        :key="item.value"
        role="option"
        :aria-selected="i === index"
        :class="['lp-row', { active: i === index }]"
        @mousedown.prevent
        @mouseenter="index = i"
        @click="pick(i)"
      >
        <span class="lp-num">{{ i < 9 ? i + 1 : '' }}</span>
        <span class="lp-label">{{ item.label }}</span>
        <span v-if="item.detail" class="lp-detail">{{ item.detail }}</span>
        <span v-if="item.current" class="codicon codicon-check lp-check" />
      </div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'

export interface ListPanelItem {
  value: string
  label: string
  detail?: string
  /** What the CLI uses right now (marked, and where the cursor starts) */
  current?: boolean
}

interface Props {
  title: string
  items: ListPanelItem[]
  hint?: string[]
  loading?: boolean
  emptyText?: string
  actions?: CommandPanelAction[]
}

const props = withDefaults(defineProps<Props>(), {
  hint: () => [],
  loading: false,
  emptyText: 'Nothing to choose from',
  actions: () => [],
})

const emit = defineEmits<{
  (e: 'select', value: string): void
  (e: 'close'): void
}>()

const index = ref(0)

// Items usually arrive after the panel opened: start on the current one
watch(
  () => props.items,
  (items) => {
    const current = items.findIndex((item) => item.current)
    index.value = current >= 0 ? current : 0
  },
  { immediate: true }
)

function pick(i: number) {
  const item = props.items[i]
  if (!item) return
  emit('select', item.value)
  emit('close')
}

function onKey(event: KeyboardEvent) {
  const n = props.items.length
  const key = event.key
  let handled = true
  if (n > 0 && (key === 'ArrowDown' || key === 'j')) index.value = (index.value + 1) % n
  else if (n > 0 && (key === 'ArrowUp' || key === 'k')) index.value = (index.value - 1 + n) % n
  else if (key === 'Home') index.value = 0
  else if (key === 'End') index.value = Math.max(0, n - 1)
  else if (key === 'Enter') pick(index.value)
  else if (/^[1-9]$/.test(key) && Number(key) <= n) pick(Number(key) - 1)
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}
</script>

<style scoped>
.lp-list {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
}

.lp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.lp-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.lp-num {
  width: 10px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.lp-label {
  flex-shrink: 0;
}

.lp-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.lp-check {
  margin-left: auto;
  font-size: 14px;
  color: var(--cs-fg-66);
}

.lp-empty {
  text-align: center;
  color: var(--cs-fg-36);
}
</style>
