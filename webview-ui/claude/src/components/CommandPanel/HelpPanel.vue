<template>
  <!-- `/help`: the keys of this chat and every `/` command (the CLI's and the
       ones this UI handles itself). Type to filter, Enter picks a command. -->
  <CommandPanel
    title="Help"
    :subtitle="query ? `filter: ${query}` : `${commands.length} commands`"
    :hint="['↑/↓ to select', 'type to filter', 'Enter to use', 'Esc to close']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div ref="bodyRef" class="hp-body">
      <template v-if="!query">
        <div class="hp-section">Shortcuts</div>
        <div v-for="item in SHORTCUTS" :key="item.keys" class="hp-row static">
          <span class="hp-name">{{ item.keys }}</span>
          <span class="hp-desc">{{ item.text }}</span>
        </div>
        <div class="hp-section">Commands</div>
      </template>
      <div v-if="shown.length === 0" class="hp-empty">No matches</div>
      <div
        v-for="(cmd, i) in shown"
        :key="cmd.id"
        :ref="(el) => { rows[i] = el as HTMLElement }"
        :class="['hp-row', { active: i === index }]"
        @mousedown.prevent
        @mouseenter="index = i"
        @click="pick(i)"
      >
        <span class="hp-name">{{ cmd.label }}</span>
        <span class="hp-desc" :title="cmd.description">{{ cmd.description }}</span>
        <span v-if="isUiCommand(cmd)" class="hp-tag">UI</span>
      </div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import CommandPanel from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import { isUiCommand } from '../../providers/slashCommandProvider'
import { agentName, isOmp } from '../../utils/backend'
import type { CommandAction } from '../../core/AppContext'

const emit = defineEmits<{
  (e: 'pick', command: string): void
  (e: 'close'): void
}>()

const runtime = inject(RuntimeKey)

const SHORTCUTS = [
  { keys: 'Enter', text: `send (queued while ${agentName} is working)` },
  { keys: 'Shift+Enter', text: 'new line' },
  { keys: 'Esc', text: 'stop the running turn, or close a menu' },
  ...(isOmp ? [] : [{ keys: 'Shift+Tab', text: 'switch permission mode' }]),
  { keys: '/', text: 'commands' },
  { keys: '@', text: 'mention a file' },
  { keys: 'Shift+drop', text: 'mention dropped files' },
  { keys: 'Ctrl+V', text: 'paste an image or file' },
]

const commands = computed<CommandAction[]>(() => {
  const list = runtime?.appContext.commandRegistry.getCommandsBySection()['Slash Commands'] ?? []
  return [...list].sort((a, b) => a.label.localeCompare(b.label))
})

const query = ref('')
const index = ref(0)
const bodyRef = ref<HTMLDivElement>()
const rows: HTMLElement[] = []

const shown = computed(() => {
  const q = query.value.trim().toLowerCase().replace(/^\//, '')
  if (!q) return commands.value
  return commands.value.filter((cmd) =>
    `${cmd.label} ${cmd.description ?? ''}`.toLowerCase().includes(q)
  )
})

watch(query, () => {
  index.value = 0
  rows.length = 0
})

watch(index, async () => {
  await nextTick()
  rows[index.value]?.scrollIntoView({ block: 'nearest' })
})

function pick(i: number) {
  const cmd = shown.value[i]
  if (!cmd) return
  emit('pick', cmd.label)
}

function onKey(event: KeyboardEvent) {
  const n = shown.value.length
  const key = event.key
  let handled = true
  if (n > 0 && key === 'ArrowDown') index.value = (index.value + 1) % n
  else if (n > 0 && key === 'ArrowUp') index.value = (index.value - 1 + n) % n
  else if (key === 'PageDown') index.value = Math.min(Math.max(0, n - 1), index.value + 8)
  else if (key === 'PageUp') index.value = Math.max(0, index.value - 8)
  else if (key === 'Home') bodyRef.value?.scrollTo({ top: 0 })
  else if (key === 'Enter') pick(index.value)
  else if (key === 'Backspace') query.value = query.value.slice(0, -1)
  else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) query.value += key
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}
</script>

<style scoped>
.hp-body {
  max-height: 260px;
  overflow-y: auto;
}

.hp-section {
  margin-top: 6px;
  padding: 0 6px 2px;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.hp-section:first-child {
  margin-top: 0;
}

.hp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.hp-row.static {
  cursor: default;
}

.hp-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.hp-name {
  width: min(130px, 40%);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hp-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.hp-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.hp-empty {
  text-align: center;
  color: var(--cs-fg-36);
}
</style>
