<template>
  <!-- Pick one entry from a list, like the CLI's menus: ↑/↓ (or j/k, digits)
       to move, Enter to pick. The current entry is marked with a check.
       `filterable`: typed text filters the list instead (only arrows move). -->
  <CommandPanel
    :title="title"
    :subtitle="query ? `filter: ${query}` : subtitle"
    :actions="actions"
    :hint="hintText"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div v-if="loading" class="lp-empty">Loading…</div>
    <div v-else-if="items.length === 0" class="lp-empty">{{ emptyText }}</div>
    <div v-else-if="shown.length === 0" class="lp-empty">No matches</div>
    <div v-else ref="listRef" class="lp-list" role="listbox">
      <div
        v-for="(item, i) in shown"
        :key="item.value"
        role="option"
        :aria-selected="i === index"
        :class="['lp-row', { active: i === index }]"
        @mousedown.prevent
        @mouseenter="index = i"
        @click="pick(i)"
      >
        <span class="lp-num">{{ !filterable && i < 9 ? i + 1 : '' }}</span>
        <span class="lp-label">{{ item.label }}</span>
        <span v-if="item.detail" class="lp-detail" :title="item.detail">{{ item.detail }}</span>
        <span v-if="item.tag" class="lp-tag">{{ item.tag }}</span>
        <span v-if="item.current" class="codicon codicon-check lp-check" />
      </div>
    </div>
    <div v-if="note" class="lp-note">{{ note }}</div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'

export interface ListPanelItem {
  value: string
  label: string
  detail?: string
  /** Muted label on the right (where the entry comes from: user, project…) */
  tag?: string
  /** What the CLI uses right now (marked, and where the cursor starts) */
  current?: boolean
}

interface Props {
  title: string
  subtitle?: string
  items: ListPanelItem[]
  hint?: string[]
  loading?: boolean
  emptyText?: string
  actions?: CommandPanelAction[]
  /** Typing filters the entries (label and detail) */
  filterable?: boolean
  /** Muted line under the list (an error, what Enter does) */
  note?: string
  /** Filter to start with (`filterable` only), e.g. the argument typed after the command */
  initialQuery?: string
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '',
  hint: () => [],
  loading: false,
  emptyText: 'Nothing to choose from',
  actions: () => [],
  filterable: false,
  note: '',
  initialQuery: '',
})

const emit = defineEmits<{
  (e: 'select', value: string): void
  (e: 'close'): void
}>()

const index = ref(0)
const query = ref(props.filterable ? props.initialQuery : '')
const listRef = ref<HTMLDivElement>()

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((item) =>
    `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(q)
  )
})

const hintText = computed(() => {
  if (props.hint.length) return props.hint
  return props.filterable
    ? ['↑/↓ to select', 'type to filter', 'Enter to confirm', 'Esc to cancel']
    : ['↑/↓ to select', 'Enter to confirm', 'Esc to cancel']
})

// Items usually arrive after the panel opened: start on the current one
watch(
  () => props.items,
  (items) => {
    const current = items.findIndex((item) => item.current)
    index.value = current >= 0 ? current : 0
  },
  { immediate: true }
)

watch(query, () => {
  index.value = 0
})

// Keep the active row visible in a long list
watch(index, async () => {
  await nextTick()
  const row = listRef.value?.children[index.value] as HTMLElement | undefined
  row?.scrollIntoView({ block: 'nearest' })
})

function pick(i: number) {
  const item = shown.value[i]
  if (!item) return
  emit('select', item.value)
  emit('close')
}

function onKey(event: KeyboardEvent) {
  const n = shown.value.length
  const key = event.key
  const nav = !props.filterable
  let handled = true
  if (n > 0 && (key === 'ArrowDown' || (nav && key === 'j'))) index.value = (index.value + 1) % n
  else if (n > 0 && (key === 'ArrowUp' || (nav && key === 'k'))) index.value = (index.value - 1 + n) % n
  else if (key === 'Home') index.value = 0
  else if (key === 'End') index.value = Math.max(0, n - 1)
  else if (key === 'PageDown') index.value = Math.min(Math.max(0, n - 1), index.value + 8)
  else if (key === 'PageUp') index.value = Math.max(0, index.value - 8)
  else if (key === 'Enter') pick(index.value)
  else if (nav && /^[1-9]$/.test(key) && Number(key) <= n) pick(Number(key) - 1)
  else if (!nav && key === 'Backspace') query.value = query.value.slice(0, -1)
  else if (!nav && key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) query.value += key
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
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.lp-tag {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.lp-check {
  margin-left: auto;
  font-size: 14px;
  color: var(--cs-fg-66);
}

.lp-tag + .lp-check {
  margin-left: 0;
}

.lp-empty {
  text-align: center;
  color: var(--cs-fg-36);
}

.lp-note {
  margin-top: 4px;
  color: var(--cs-fg-36);
  overflow-wrap: anywhere;
}
</style>
