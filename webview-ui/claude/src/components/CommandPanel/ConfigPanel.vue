<template>
  <!-- `/config`: the CLI's settings list (keys and values from its own usage
       text), changed in place and saved as `/config key=value …`. -->
  <CommandPanel
    title="Settings"
    :subtitle="subtitle"
    :actions="actions"
    :hint="['↑/↓ select', '←/→ or Space change', 'Enter edit text / save', 'type to filter', 'Esc cancel']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <input
      ref="searchRef"
      v-model="filter"
      class="cfg-search"
      type="text"
      spellcheck="false"
      placeholder="Filter settings…"
    />

    <div v-if="loading" class="cfg-empty">Loading…</div>
    <div v-else-if="error" class="cfg-empty cfg-error">{{ error }}</div>
    <div v-else-if="visible.length === 0" class="cfg-empty">No matching setting</div>
    <div v-else ref="listRef" class="cfg-list" role="listbox">
      <div
        v-for="(option, i) in visible"
        :key="option.key"
        role="option"
        :aria-selected="i === index"
        :class="['cfg-row', { active: i === index }]"
        @mousedown.prevent
        @click="select(i)"
      >
        <span :class="['cfg-mark', { on: option.key in changes }]">•</span>
        <span class="cfg-key">{{ option.key }}</span>

        <!-- Free text: edited inline (Enter on the row) -->
        <input
          v-if="option.values === null && editing === option.key"
          ref="editRef"
          v-model="editText"
          class="cfg-edit"
          type="text"
          spellcheck="false"
          @keydown="onEditKey"
          @mousedown.stop
        />
        <span v-else-if="option.values === null" class="cfg-value" :class="{ unset: !valueOf(option) }">
          {{ valueOf(option) || 'default' }}
        </span>

        <!-- true/false: a switch -->
        <span
          v-else-if="isBoolean(option)"
          :class="['cfg-switch', valueOf(option) === 'true' ? 'on' : valueOf(option) === 'false' ? 'off' : 'unset']"
          @click.stop="select(i); cycle(option, 1)"
        >
          {{ valueOf(option) === 'true' ? 'on' : valueOf(option) === 'false' ? 'off' : 'default' }}
        </span>

        <!-- Other choices: ‹ value › -->
        <span v-else class="cfg-choice">
          <span class="cfg-arrow" @click.stop="select(i); cycle(option, -1)">‹</span>
          <span class="cfg-value" :class="{ unset: !valueOf(option) }">{{ valueOf(option) || 'default' }}</span>
          <span class="cfg-arrow" @click.stop="select(i); cycle(option, 1)">›</span>
        </span>
      </div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { ConfigOption } from '@shared/messages'

const emit = defineEmits<{
  /** Commands to send, in order */
  (e: 'run', commands: string[]): void
  (e: 'openFile'): void
  (e: 'close'): void
}>()

const runtime = inject(RuntimeKey)

const options = ref<ConfigOption[]>([])
/** Values read back from the CLI; keys missing here are unknown */
const current = ref<Record<string, string>>({})
/** Edited in this panel, not saved yet */
const changes = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')
const filter = ref('')
const index = ref(0)
const editing = ref<string | null>(null)
const editText = ref('')

const searchRef = ref<HTMLInputElement>()
const listRef = ref<HTMLDivElement>()
const editRef = ref<HTMLInputElement[] | HTMLInputElement>()

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? options.value.filter((o) => o.key.toLowerCase().includes(q)) : options.value
})

watch(filter, () => {
  index.value = 0
})

const changeCount = computed(() => Object.keys(changes.value).length)

const subtitle = computed(() => (changeCount.value ? `${changeCount.value} unsaved` : ''))

function valueOf(option: ConfigOption): string | undefined {
  return changes.value[option.key] ?? current.value[option.key]
}

function isBoolean(option: ConfigOption): boolean {
  const v = option.values
  return !!v && v.length === 2 && v.includes('true') && v.includes('false')
}

function setValue(option: ConfigOption, value: string) {
  const next = { ...changes.value }
  if (current.value[option.key] === value) delete next[option.key]
  else next[option.key] = value
  changes.value = next
}

/** Next/previous value; from an unknown default → starts at the first/last value */
function cycle(option: ConfigOption, delta: number) {
  const values = option.values
  if (!values || values.length === 0) return
  const value = valueOf(option)
  const at = value === undefined ? -1 : values.indexOf(value)
  const next = at < 0 ? (delta > 0 ? 0 : values.length - 1) : (at + delta + values.length) % values.length
  setValue(option, values[next])
}

function select(i: number) {
  index.value = i
  focusSearch()
}

function focusSearch() {
  nextTick(() => searchRef.value?.focus())
}

function scrollToActive() {
  nextTick(() => {
    const row = listRef.value?.children[index.value] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  })
}

function startEdit(option: ConfigOption) {
  editing.value = option.key
  editText.value = valueOf(option) ?? ''
  nextTick(() => {
    const el = Array.isArray(editRef.value) ? editRef.value[0] : editRef.value
    el?.focus()
    el?.select()
  })
}

function onEditKey(event: KeyboardEvent) {
  if (event.isComposing) return
  const option = options.value.find((o) => o.key === editing.value)
  if (event.key === 'Enter') {
    if (option && editText.value.trim()) setValue(option, editText.value.trim())
  } else if (event.key !== 'Escape') {
    return
  }
  // Enter / Esc end the edit only; keep them from saving or closing the panel
  event.preventDefault()
  event.stopPropagation()
  editing.value = null
  focusSearch()
}

/**
 * `/config a=b c=d` takes several pairs only when no value has a space (a
 * single pair takes the rest of the line): spaced values get their own command.
 */
function buildCommands(): string[] {
  const plain: string[] = []
  const spaced: string[] = []
  for (const [key, value] of Object.entries(changes.value)) {
    ;(/\s/.test(value) ? spaced : plain).push(`${key}=${value}`)
  }
  const commands = spaced.map((pair) => `/config ${pair}`)
  if (plain.length) commands.unshift(`/config ${plain.join(' ')}`)
  return commands
}

function save() {
  const commands = buildCommands()
  if (commands.length) emit('run', commands)
  emit('close')
}

function onKey(event: KeyboardEvent) {
  if (editing.value) return
  const n = visible.value.length
  const option = visible.value[index.value]
  const key = event.key
  let handled = true
  if (key === 'ArrowDown' && n) {
    index.value = (index.value + 1) % n
    scrollToActive()
  } else if (key === 'ArrowUp' && n) {
    index.value = (index.value - 1 + n) % n
    scrollToActive()
  } else if ((key === 'ArrowRight' || key === ' ') && option?.values) cycle(option, 1)
  else if (key === 'ArrowLeft' && option?.values) cycle(option, -1)
  else if (key === 'Enter' && !event.isComposing) {
    if (option && option.values === null && !(event.ctrlKey || event.metaKey)) startEdit(option)
    else save()
  } else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const actions = computed<CommandPanelAction[]>(() => [
  { label: 'Open settings.json', run: () => emit('openFile') },
  { label: changeCount.value ? `Save (${changeCount.value})` : 'Save', key: '↵', primary: true, run: save },
])

onMounted(async () => {
  // CommandPanel focuses its frame after this mounts: take it back for the filter
  setTimeout(() => searchRef.value?.focus(), 0)
  const session = runtime?.sessionStore.activeSession()
  if (!session) {
    loading.value = false
    error.value = 'No active session'
    return
  }
  try {
    const result = await session.getConfigOptions()
    options.value = result.options
    current.value = result.current
    if (result.error) error.value = `Could not read the settings list: ${result.error}`
    else if (result.options.length === 0) error.value = 'The CLI listed no settings'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.cfg-search {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 4px;
  padding: 3px 8px;
  border: 1px solid var(--cs-fg-12);
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg);
  font: inherit;
  outline: none;
  user-select: text;
}

.cfg-search:focus {
  border-color: var(--cs-fg-36);
}

.cfg-search::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.cfg-list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
}

.cfg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.cfg-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.cfg-mark {
  width: 8px;
  flex-shrink: 0;
  color: transparent;
}

.cfg-mark.on {
  color: var(--vscode-focusBorder, var(--cs-fg-66));
}

.cfg-key {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfg-value {
  color: var(--cs-fg-74);
  white-space: nowrap;
}

.cfg-value.unset {
  color: var(--cs-fg-36);
}

.cfg-choice {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cfg-arrow {
  padding: 0 3px;
  color: var(--cs-fg-36);
  border-radius: 3px;
}

.cfg-arrow:hover {
  color: var(--cs-fg);
  background: var(--cs-fg-8);
}

.cfg-switch {
  min-width: 44px;
  padding: 0 6px;
  border-radius: 9px;
  text-align: center;
  font-size: 11px;
  line-height: 16px;
  background: var(--cs-fg-8);
  color: var(--cs-fg-36);
}

.cfg-switch.on {
  background: var(--cs-fg-20);
  color: var(--cs-fg);
}

.cfg-switch.off {
  color: var(--cs-fg-60);
}

.cfg-edit {
  width: 50%;
  padding: 0 6px;
  border: 1px solid var(--cs-fg-36);
  border-radius: 3px;
  background: transparent;
  color: var(--cs-fg);
  font: inherit;
  outline: none;
  user-select: text;
}

.cfg-empty {
  padding: 8px 0;
  text-align: center;
  color: var(--cs-fg-36);
}

.cfg-error {
  color: var(--vscode-errorForeground);
}
</style>
