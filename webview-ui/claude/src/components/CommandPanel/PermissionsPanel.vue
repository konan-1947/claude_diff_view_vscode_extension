<template>
  <!-- `/permissions`: the CLI's Permissions screen. Tabs Allow / Ask / Deny list
       the rules of the user, project and local settings files; Workspace lists
       the working directories. Rules are added to or removed from those files
       directly (the CLI picks settings changes up on its own). -->
  <CommandPanel
    ref="panelRef"
    title="Permissions"
    :subtitle="subtitle"
    :actions="actions"
    :hint="hint"
    top
    @cancel="onCancel"
    @key="onKey"
  >
    <div class="pp-tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        tabindex="-1"
        role="tab"
        :aria-selected="t.id === tab"
        :class="['pp-tab', { active: t.id === tab }]"
        @mousedown.prevent
        @click="switchTab(t.id)"
      >
        {{ t.label }}<span class="pp-count">{{ countFor(t.id) || '' }}</span>
      </button>
    </div>

    <!-- Same height on every tab, so the tab row and the frame stay put -->
    <div class="pp-content">
    <div v-if="adding" class="pp-add">
      <input
        ref="inputRef"
        v-model="draft"
        class="pp-input"
        type="text"
        spellcheck="false"
        :placeholder="`${TAB_LABELS[tab]} rule, e.g. Bash(npm run test:*)`"
      />
      <div class="pp-sources">
        <span class="pp-muted">Save in</span>
        <button
          v-for="s in SOURCES"
          :key="s"
          type="button"
          tabindex="-1"
          :class="['pp-source', { active: s === addSource }]"
          :title="SOURCE_NOTES[s]"
          @mousedown.prevent
          @click="addSource = s"
        >
          {{ SOURCE_LABELS[s] }}
        </button>
        <span class="pp-muted">{{ SOURCE_NOTES[addSource] }}</span>
      </div>
      <div class="pp-muted">
        Tool, or Tool(specifier): <code>Bash(git diff:*)</code> <code>Read(./secrets/**)</code>
        <code>WebFetch(domain:example.com)</code> <code>mcp__server</code>
      </div>
    </div>
    <template v-else>
      <div v-if="loading && rows.length === 0" class="pp-empty">Loading…</div>
      <div v-else-if="rows.length === 0" class="pp-empty">{{ emptyText }}</div>
      <div v-else ref="listRef" class="pp-list" role="listbox">
        <div
          v-for="(row, i) in rows"
          :key="row.key"
          role="option"
          :aria-selected="i === index"
          :class="['pp-row', { active: i === index }]"
          @mousedown.prevent
          @click="index = i"
          @dblclick="openSource(row)"
        >
          <span class="pp-value" :title="row.value">{{ row.value }}</span>
          <span class="pp-tag">{{ row.tag }}</span>
        </div>
      </div>
    </template>
    <div v-if="message" :class="['pp-note', { error: messageIsError }]">{{ message }}</div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { PermissionEntry, PermissionListName, SettingsFileKind } from '@shared/messages'

const emit = defineEmits<{
  (e: 'close'): void
  /** Workspace tab → Add: the `/add-dir` flow (folder picker, then scope) */
  (e: 'addDirectory'): void
}>()

type TabId = 'allow' | 'ask' | 'deny' | 'workspace'

const TABS: { id: TabId; label: string }[] = [
  { id: 'allow', label: 'Allow' },
  { id: 'ask', label: 'Ask' },
  { id: 'deny', label: 'Deny' },
  { id: 'workspace', label: 'Workspace' },
]
const TAB_LABELS: Record<TabId, string> = { allow: 'Allow', ask: 'Ask', deny: 'Deny', workspace: 'Workspace' }
const TAB_NOTES: Record<TabId, string> = {
  allow: 'Claude uses these tools without asking',
  ask: 'Claude always asks before using these tools',
  deny: 'Claude may never use these tools',
  workspace: 'Claude can read and edit files in these directories',
}

const SOURCES: SettingsFileKind[] = ['local-settings', 'project-settings', 'user-settings']
const SOURCE_LABELS: Record<SettingsFileKind, string> = {
  'local-settings': 'Local',
  'project-settings': 'Project',
  'user-settings': 'User',
}
const SOURCE_NOTES: Record<SettingsFileKind, string> = {
  'local-settings': '.claude/settings.local.json, not checked in',
  'project-settings': '.claude/settings.json, shared with the team',
  'user-settings': '~/.claude/settings.json, all projects',
}
const SOURCE_TAGS: Record<SettingsFileKind, string> = { 'local-settings': 'local', 'project-settings': 'project', 'user-settings': 'user' }

interface Row {
  key: string
  value: string
  tag: string
  /** Settings file it is in; none for the working folder and session-only directories */
  source?: SettingsFileKind
  /** `/add-dir` for this session only */
  session?: boolean
}

const runtime = inject(RuntimeKey)
const panelRef = ref<InstanceType<typeof CommandPanel>>()
const listRef = ref<HTMLDivElement>()
const inputRef = ref<HTMLInputElement>()

function activeSession() {
  return runtime?.sessionStore.activeSession()
}
/** Copy of the session's `/add-dir` list (a signal, not reactive in Vue), read on refresh */
const sessionDirs = ref<string[]>([])

const entries = ref<PermissionEntry[]>([])
const cwd = ref('')
const loading = ref(false)
const tab = ref<TabId>('allow')
const index = ref(0)
const adding = ref(false)
const draft = ref('')
const addSource = ref<SettingsFileKind>('local-settings')
const message = ref('')
const messageIsError = ref(false)
/** Row key armed for deletion: the second D / Delete removes it */
const armed = ref<string | null>(null)
const working = ref(false)

function listFor(id: TabId): PermissionListName {
  return id === 'workspace' ? 'additionalDirectories' : id
}

const rows = computed<Row[]>(() => {
  const list = listFor(tab.value)
  // Highest precedence first, as the CLI lists them
  const fromFiles = entries.value
    .filter((e) => e.list === list)
    .slice()
    .reverse()
    .map((e) => ({ key: `${e.source}:${e.value}`, value: e.value, tag: SOURCE_TAGS[e.source], source: e.source }))
  if (tab.value !== 'workspace') return fromFiles
  return [
    ...(cwd.value ? [{ key: 'cwd', value: cwd.value, tag: 'working folder' }] : []),
    ...sessionDirs.value.map((dir) => ({ key: `session:${dir}`, value: dir, tag: 'this session', session: true })),
    ...fromFiles,
  ]
})

const selected = computed(() => rows.value[index.value])

function countFor(id: TabId): number {
  const list = listFor(id)
  const n = entries.value.filter((e) => e.list === list).length
  return id === 'workspace' ? n + sessionDirs.value.length : n
}

const subtitle = computed(() => TAB_NOTES[tab.value])

const emptyText = computed(() =>
  tab.value === 'workspace' ? 'No working directories' : `No ${TAB_LABELS[tab.value].toLowerCase()} rules. Press A to add one.`
)

const hint = computed(() =>
  adding.value
    ? ['Enter to save', 'Tab to change the file', 'Esc to go back']
    : ['←/→ tabs', '↑/↓ to select', 'A add', 'D delete', 'Enter open file', 'Esc to close']
)

const actions = computed<CommandPanelAction[]>(() => {
  if (adding.value) {
    return [
      { label: 'Cancel', run: stopAdding },
      { label: 'Save', key: '↵', primary: true, run: () => void saveDraft() },
    ]
  }
  const list: CommandPanelAction[] = [{ label: 'Add', key: 'A', run: startAdding }]
  if (selected.value && (selected.value.source || selected.value.session)) {
    list.push({ label: armed.value === selected.value.key ? 'Confirm delete' : 'Delete', key: 'D', run: () => void removeSelected() })
  }
  return list
})

function connection() {
  return runtime?.connectionManager.get()
}

function say(text: string, error = false) {
  message.value = text
  messageIsError.value = error
}

async function refresh() {
  loading.value = true
  try {
    const result = await (await connection())?.getPermissions()
    entries.value = result?.entries ?? []
    sessionDirs.value = activeSession()?.additionalDirectories() ?? []
    cwd.value = activeSession()?.cwd() || result?.cwd || ''
    const errors = result?.errors ?? []
    if (errors.length) {
      say(errors.map((e) => `${SOURCE_TAGS[e.source as SettingsFileKind] ?? e.source} settings could not be read: ${e.error}`).join('\n'), true)
    }
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    loading.value = false
    index.value = Math.min(index.value, Math.max(0, rows.value.length - 1))
  }
}

function switchTab(id: TabId) {
  tab.value = id
  index.value = 0
  armed.value = null
  stopAdding()
}

function startAdding() {
  if (tab.value === 'workspace') {
    emit('addDirectory')
    return
  }
  adding.value = true
  draft.value = ''
  message.value = ''
  nextTick(() => inputRef.value?.focus())
}

function stopAdding() {
  if (!adding.value) return
  adding.value = false
  nextTick(() => panelRef.value?.focus())
}

// Tool name, optionally with a specifier in parentheses (MCP names are tool names too)
const RULE_PATTERN = /^[A-Za-z_][\w.-]*(\(.+\))?$/

async function saveDraft() {
  const value = draft.value.trim()
  if (!value) return
  if (!RULE_PATTERN.test(value)) {
    say('A rule is a tool name, optionally followed by a specifier in parentheses: Bash(npm test)', true)
    return
  }
  const list = listFor(tab.value)
  if (entries.value.some((e) => e.list === list && e.value === value && e.source === addSource.value)) {
    say(`${value} is already in the ${SOURCE_TAGS[addSource.value]} settings`, true)
    return
  }
  working.value = true
  try {
    const error = await (await connection())?.updatePermission(list, 'add', value, addSource.value)
    if (error) {
      say(error, true)
      return
    }
    say(`Added ${value} to ${TAB_LABELS[tab.value]} (${SOURCE_TAGS[addSource.value]} settings)`)
    adding.value = false
    await refresh()
    const at = rows.value.findIndex((r) => r.source === addSource.value && r.value === value)
    if (at >= 0) index.value = at
    nextTick(() => panelRef.value?.focus())
  } finally {
    working.value = false
  }
}

async function removeSelected() {
  const row = selected.value
  if (!row || working.value || (!row.source && !row.session)) return
  if (armed.value !== row.key) {
    armed.value = row.key
    say(`Press D again to delete ${row.value}`)
    return
  }
  armed.value = null
  working.value = true
  try {
    if (row.session) {
      const session = activeSession()
      if (!session) return
      if (session.busy()) {
        say('Wait for the current turn to finish', true)
        return
      }
      session.additionalDirectories(session.additionalDirectories().filter((d) => d !== row.value))
      sessionDirs.value = session.additionalDirectories()
      await session.relaunch()
      say(`Removed ${row.value} from this session`)
      return
    }
    const error = await (await connection())?.updatePermission(listFor(tab.value), 'remove', row.value, row.source!)
    if (error) {
      say(error, true)
      return
    }
    say(`Deleted ${row.value} (${SOURCE_TAGS[row.source!]} settings)`)
    await refresh()
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    working.value = false
  }
}

async function openSource(row: Row | undefined) {
  if (!row?.source) return
  const error = await (await connection())?.openClaudeFile(row.source)
  if (error) say(error, true)
}

function onCancel() {
  if (adding.value) {
    stopAdding()
    return
  }
  emit('close')
}

function moveTab(step: number) {
  const at = TABS.findIndex((t) => t.id === tab.value)
  switchTab(TABS[(at + step + TABS.length) % TABS.length].id)
}

function onKey(event: KeyboardEvent) {
  const key = event.key
  let handled = true
  if (adding.value) {
    if (key === 'Enter') void saveDraft()
    else if (key === 'Tab') {
      const at = SOURCES.indexOf(addSource.value)
      addSource.value = SOURCES[(at + (event.shiftKey ? SOURCES.length - 1 : 1)) % SOURCES.length]
    } else handled = false
  } else {
    const n = rows.value.length
    const lower = key.toLowerCase()
    if (key === 'ArrowRight' || (key === 'Tab' && !event.shiftKey)) moveTab(1)
    else if (key === 'ArrowLeft' || (key === 'Tab' && event.shiftKey)) moveTab(-1)
    else if (n > 0 && (key === 'ArrowDown' || lower === 'j')) index.value = (index.value + 1) % n
    else if (n > 0 && (key === 'ArrowUp' || lower === 'k')) index.value = (index.value - 1 + n) % n
    else if (lower === 'a') startAdding()
    else if (lower === 'd' || key === 'Delete' || key === 'Backspace') void removeSelected()
    else if (key === 'Enter') void openSource(selected.value)
    else if (lower === 'r') void refresh()
    else handled = false
  }
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

watch(index, async () => {
  if (armed.value && armed.value !== selected.value?.key) armed.value = null
  await nextTick()
  const row = listRef.value?.children[index.value] as HTMLElement | undefined
  row?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.pp-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 4px;
}

.pp-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg-66);
  font: inherit;
  cursor: pointer;
}

.pp-tab:hover {
  background: var(--cs-fg-8);
}

.pp-tab.active {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}

.pp-count {
  font-size: 11px;
  color: var(--cs-fg-36);
}

.pp-content {
  height: 200px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Takes the room left in .pp-content and scrolls; a short list leaves it empty below */
.pp-list {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.pp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.pp-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.pp-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.pp-add {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pp-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--cs-fg-12);
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  outline: none;
  user-select: text;
}

.pp-input:focus {
  border-color: var(--cs-fg-36);
}

.pp-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.pp-sources {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pp-source {
  padding: 1px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--cs-fg-66);
  font: inherit;
  cursor: pointer;
}

.pp-source.active {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}

.pp-muted {
  color: var(--cs-fg-36);
  margin-right: 4px;
}

.pp-muted code {
  margin-right: 6px;
}

.pp-empty {
  padding-top: 24px;
  text-align: center;
  color: var(--cs-fg-36);
}

.pp-note {
  flex-shrink: 0;
  max-height: 48px;
  overflow-y: auto;
  margin-top: 4px;
  color: var(--cs-fg-36);
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.pp-note.error {
  color: var(--vscode-errorForeground);
}
</style>
