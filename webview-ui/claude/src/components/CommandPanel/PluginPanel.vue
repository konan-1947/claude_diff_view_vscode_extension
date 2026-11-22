<template>
  <!-- `/plugin`: the CLI's plugin manager, backed by `claude plugin ...`.
       Installed: enable / disable / uninstall. Discover: plugins of the
       configured marketplaces, installed into a chosen scope. Marketplaces:
       add / update / remove. Open sessions reload their plugins after a change.
       An install that runs a command declared by the marketplace shows that
       command and waits for approval (the CLI's own safeguard). -->
  <CommandPanel
    ref="panelRef"
    title="Plugins"
    :subtitle="subtitle"
    :actions="actions"
    :hint="hint"
    :persistent="!!working || mode === 'confirm'"
    top
    @cancel="onCancel"
    @key="onKey"
  >
    <div class="pl-tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        tabindex="-1"
        role="tab"
        :aria-selected="t.id === tab"
        :class="['pl-tab', { active: t.id === tab }]"
        @mousedown.prevent
        @click="switchTab(t.id)"
      >
        {{ t.label }}<span v-if="countFor(t.id)" class="pl-count">{{ countFor(t.id) }}</span>
      </button>
      <span v-if="tab === 'discover' && mode === 'list'" class="pl-query">
        <span class="codicon codicon-search" />
        <span v-if="query">{{ query }}</span>
        <span v-else class="pl-muted">type to search</span>
      </span>
    </div>

    <!-- Same height on every tab, so the tab row and the frame stay put -->
    <div class="pl-content">
    <div v-if="working" class="pl-empty">{{ working }}</div>

    <!-- Install: pick the scope -->
    <div v-else-if="mode === 'scope'" class="pl-list" role="listbox">
      <div class="pl-muted pl-pad">Install {{ pending?.name }} for</div>
      <div
        v-for="(s, i) in SCOPES"
        :key="s.value"
        role="option"
        :aria-selected="i === scopeIndex"
        :class="['pl-row', { active: i === scopeIndex }]"
        @mousedown.prevent
        @mouseenter="scopeIndex = i"
        @click="install(s.value)"
      >
        <span class="pl-num">{{ i + 1 }}</span>
        <span class="pl-name">{{ s.label }}</span>
        <span class="pl-detail">{{ s.detail }}</span>
      </div>
    </div>

    <!-- Install: approve the marketplace's command -->
    <div v-else-if="mode === 'confirm' && confirmation" class="pl-confirm">
      <div>{{ pending?.name }} is installed by running this command from its marketplace:</div>
      <pre class="pl-command">{{ confirmation.command }}</pre>
      <div v-if="confirmation.archiveUrl" class="pl-muted">Archive: {{ confirmation.archiveUrl }}</div>
      <div class="pl-muted">Only run it if you trust the marketplace and the plugin.</div>
    </div>

    <!-- Marketplaces: add one -->
    <div v-else-if="mode === 'add-marketplace'" class="pl-form">
      <input
        ref="inputRef"
        v-model="draft"
        class="pl-input"
        type="text"
        spellcheck="false"
        placeholder="owner/repo, git or https URL, or a local path"
      />
      <div class="pl-muted">The marketplace is added to your user settings.</div>
    </div>

    <template v-else>
      <div v-if="loading && rows.length === 0" class="pl-empty">{{ loadingText }}</div>
      <div v-else-if="rows.length === 0" class="pl-empty">{{ emptyText }}</div>
      <div v-else ref="listRef" class="pl-list" role="listbox">
        <div
          v-for="(row, i) in rows"
          :key="row.key"
          role="option"
          :aria-selected="i === index"
          :class="['pl-row', { active: i === index }]"
          @mousedown.prevent
          @click="index = i"
          @dblclick="activate"
        >
          <span v-if="row.dot !== undefined" :class="['pl-dot', { on: row.dot }]" />
          <span class="pl-name">{{ row.name }}</span>
          <span v-if="row.badge" class="pl-badge">{{ row.badge }}</span>
          <span class="pl-detail" :title="row.detail">{{ row.detail }}</span>
          <span v-if="row.tag" class="pl-tag">{{ row.tag }}</span>
          <span v-if="row.count !== undefined" class="pl-stat" :title="row.countTitle">
            <span v-if="row.count" class="codicon codicon-cloud-download" />{{ row.count }}
          </span>
        </div>
        <div v-if="tab === 'discover' && moreCount > 0" class="pl-more">
          {{ moreCount }} more, type to narrow the list
        </div>
      </div>
      <div v-if="tab === 'discover' && selectedAvailable" class="pl-info">
        <div class="pl-info-head">
          <span class="pl-info-name">{{ selectedAvailable.name }}</span>
          <span class="pl-muted">{{ selectedAvailable.id }}</span>
        </div>
        <div :class="['pl-description', { 'pl-muted': !selectedDescription }]" :title="selectedDescription">
          {{ selectedDescription || 'No description' }}
        </div>
      </div>
    </template>

    <div v-if="message" :class="['pl-note', { error: messageIsError }]">{{ message }}</div>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type {
  AvailablePluginEntry,
  MarketplaceEntry,
  PluginCommandConfirmation,
  PluginEntry,
} from '@shared/messages'

const emit = defineEmits<{ (e: 'close'): void }>()

type TabId = 'installed' | 'discover' | 'marketplaces'
type Mode = 'list' | 'scope' | 'confirm' | 'add-marketplace'

const TABS: { id: TabId; label: string }[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'discover', label: 'Discover' },
  { id: 'marketplaces', label: 'Marketplaces' },
]

const SCOPES = [
  { value: 'user', label: 'You, in all projects', detail: '~/.claude/settings.json' },
  { value: 'project', label: 'Everyone on this project', detail: '.claude/settings.json, checked in' },
  { value: 'local', label: 'You, in this project only', detail: '.claude/settings.local.json' },
]

/** Rows drawn at once in Discover; typing narrows the rest */
const DISCOVER_LIMIT = 100

interface Row {
  key: string
  name: string
  detail: string
  tag?: string
  /** Small label right after the name ("installed") */
  badge?: string
  /** Right-aligned column (Discover: install count); '' keeps the column empty */
  count?: string
  countTitle?: string
  /** Enabled dot (installed plugins only) */
  dot?: boolean
}

const runtime = inject(RuntimeKey)
const panelRef = ref<InstanceType<typeof CommandPanel>>()
const listRef = ref<HTMLDivElement>()
const inputRef = ref<HTMLInputElement>()

const tab = ref<TabId>('installed')
const mode = ref<Mode>('list')
const index = ref(0)
const scopeIndex = ref(0)
const query = ref('')
const draft = ref('')

const installed = ref<PluginEntry[]>([])
const available = ref<AvailablePluginEntry[]>([])
const marketplaces = ref<MarketplaceEntry[]>([])
const availableLoaded = ref(false)
const marketplacesLoaded = ref(false)
const loading = ref(false)

/** Text of the running CLI command ("Installing x…"); keys wait meanwhile */
const working = ref('')
const message = ref('')
const messageIsError = ref(false)
/** Row armed for removal: the second D removes it */
const armed = ref<string | null>(null)
/** Plugin being installed (scope / confirm steps) */
const pending = ref<AvailablePluginEntry>()
const pendingScope = ref('user')
const confirmation = ref<PluginCommandConfirmation>()

async function connection() {
  return runtime?.connectionManager.get()
}

function say(text: string, error = false) {
  message.value = text
  messageIsError.value = error
}

function formatCount(n: number | undefined): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const installedIds = computed(() => new Set(installed.value.map((p) => p.id)))

const discoverMatches = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? available.value.filter((p) => `${p.name} ${p.id} ${p.description ?? ''}`.toLowerCase().includes(q))
    : available.value
  return list.slice().sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0))
})

const moreCount = computed(() => Math.max(0, discoverMatches.value.length - DISCOVER_LIMIT))

const rows = computed<Row[]>(() => {
  if (tab.value === 'installed') {
    return installed.value.map((p) => ({
      key: `${p.id}:${p.scope ?? ''}`,
      name: p.name,
      detail: [p.enabled ? 'enabled' : 'disabled', p.version ? `v${p.version}` : '', p.marketplace ?? '']
        .filter(Boolean)
        .join('   '),
      tag: p.scope,
      dot: p.enabled,
    }))
  }
  if (tab.value === 'discover') {
    return discoverMatches.value.slice(0, DISCOVER_LIMIT).map((p) => ({
      key: p.id,
      name: p.name,
      detail: '',
      badge: installedIds.value.has(p.id) ? 'installed' : undefined,
      tag: p.marketplace,
      count: formatCount(p.installCount),
      countTitle: p.installCount ? `${p.installCount.toLocaleString()} installs` : undefined,
    }))
  }
  return marketplaces.value.map((m) => ({
    key: m.name,
    name: m.name,
    detail: [m.source, m.location].filter(Boolean).join('   '),
  }))
})

const selectedInstalled = computed(() => (tab.value === 'installed' ? installed.value[index.value] : undefined))
const selectedAvailable = computed(() => (tab.value === 'discover' ? discoverMatches.value[index.value] : undefined))
const selectedMarketplace = computed(() => (tab.value === 'marketplaces' ? marketplaces.value[index.value] : undefined))
const selectedDescription = computed(() => selectedAvailable.value?.description ?? '')

function countFor(id: TabId): number {
  if (id === 'installed') return installed.value.length
  if (id === 'discover') return available.value.length
  return marketplaces.value.length
}

const subtitle = computed(() => {
  if (tab.value === 'installed' && installed.value.length) {
    return `${installed.value.filter((p) => p.enabled).length}/${installed.value.length} enabled`
  }
  return ''
})

const loadingText = computed(() =>
  tab.value === 'discover' ? 'Loading plugins from the marketplaces…' : 'Loading…'
)

const emptyText = computed(() => {
  if (tab.value === 'installed') return 'No plugins installed. Find one in Discover (→).'
  if (tab.value === 'discover') return query.value ? 'No matches' : 'The marketplaces list no plugins'
  return 'No marketplaces. Press A to add one.'
})

const hint = computed(() => {
  if (working.value) return ['Esc to close (the command keeps running)']
  if (mode.value === 'scope') return ['↑/↓ to select', 'Enter to install', 'Esc to go back']
  if (mode.value === 'confirm') return ['Enter to run and install', 'Esc to cancel']
  if (mode.value === 'add-marketplace') return ['Enter to add', 'Esc to go back']
  if (tab.value === 'installed') return ['←/→ tabs', 'Enter or E enable/disable', 'D uninstall', 'R refresh', 'Esc to close']
  if (tab.value === 'discover') return ['←/→ tabs', 'type to search', 'Enter to install', 'Esc to close']
  return ['←/→ tabs', 'A add', 'U update', 'D remove', 'Esc to close']
})

const actions = computed<CommandPanelAction[]>(() => {
  if (working.value) return []
  if (mode.value === 'confirm') {
    return [
      { label: 'Cancel', run: backToList },
      { label: 'Run and install', key: '↵', primary: true, run: () => void install(pendingScope.value, true) },
    ]
  }
  if (mode.value === 'add-marketplace') {
    return [
      { label: 'Cancel', run: backToList },
      { label: 'Add', key: '↵', primary: true, run: () => void addMarketplace() },
    ]
  }
  if (mode.value !== 'list') return []
  if (tab.value === 'installed') {
    const p = selectedInstalled.value
    const list: CommandPanelAction[] = [{ label: 'Refresh', key: 'R', run: () => void loadInstalled() }]
    if (p) {
      list.push({ label: p.enabled ? 'Disable' : 'Enable', key: 'E', run: () => void toggle() })
      list.push({ label: armed.value === rowKey() ? 'Confirm uninstall' : 'Uninstall', key: 'D', run: () => void uninstall() })
    }
    return list
  }
  if (tab.value === 'discover') {
    const list: CommandPanelAction[] = [{ label: 'Refresh', run: () => void loadAvailable(true) }]
    if (selectedAvailable.value && !installedIds.value.has(selectedAvailable.value.id)) {
      list.push({ label: 'Install', key: '↵', primary: true, run: () => void startInstall() })
    }
    return list
  }
  const list: CommandPanelAction[] = [{ label: 'Add', key: 'A', run: startAddMarketplace }]
  if (selectedMarketplace.value) {
    list.push({ label: 'Update', key: 'U', run: () => void marketplaceAction('update') })
    list.push({ label: armed.value === rowKey() ? 'Confirm remove' : 'Remove', key: 'D', run: () => void marketplaceAction('remove') })
  }
  return list
})

function rowKey(): string | undefined {
  return rows.value[index.value]?.key
}

// ----------------------------------------------------------------------------
// Loading
// ----------------------------------------------------------------------------

async function loadInstalled() {
  loading.value = true
  try {
    const result = await (await connection())?.getPlugins()
    installed.value = result?.plugins ?? []
    if (result?.error) say(result.error, true)
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    loading.value = false
    clampIndex()
  }
}

async function loadAvailable(refresh = false) {
  loading.value = true
  try {
    const result = await (await connection())?.getAvailablePlugins(refresh)
    available.value = result?.plugins ?? []
    availableLoaded.value = true
    if (result?.error) say(result.error, true)
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    loading.value = false
    clampIndex()
  }
}

async function loadMarketplaces() {
  loading.value = true
  try {
    const result = await (await connection())?.getMarketplaces()
    marketplaces.value = result?.marketplaces ?? []
    marketplacesLoaded.value = true
    if (result?.error) say(result.error, true)
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    loading.value = false
    clampIndex()
  }
}

function clampIndex() {
  index.value = Math.min(index.value, Math.max(0, rows.value.length - 1))
}

function switchTab(id: TabId) {
  if (working.value) return
  tab.value = id
  mode.value = 'list'
  index.value = 0
  armed.value = null
  message.value = ''
  if (id === 'discover' && !availableLoaded.value) void loadAvailable()
  if (id === 'marketplaces' && !marketplacesLoaded.value) void loadMarketplaces()
  nextTick(() => panelRef.value?.focus())
}

function moveTab(step: number) {
  const at = TABS.findIndex((t) => t.id === tab.value)
  switchTab(TABS[(at + step + TABS.length) % TABS.length].id)
}

function backToList() {
  mode.value = 'list'
  confirmation.value = undefined
  nextTick(() => panelRef.value?.focus())
}

/** Run one CLI command with a "working" line; resolves to whatever `run` returned */
async function runWorking<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  working.value = label
  message.value = ''
  try {
    return await run()
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
    return undefined
  } finally {
    working.value = ''
    nextTick(() => panelRef.value?.focus())
  }
}

// ----------------------------------------------------------------------------
// Installed
// ----------------------------------------------------------------------------

async function toggle() {
  const plugin = selectedInstalled.value
  if (!plugin) return
  const action = plugin.enabled ? 'disable' : 'enable'
  const result = await runWorking(`${plugin.enabled ? 'Disabling' : 'Enabling'} ${plugin.name}…`, async () =>
    (await connection())?.pluginAction(action, plugin.id, plugin.scope)
  )
  if (result?.error) say(`${plugin.name}: ${result.error}`, true)
  await loadInstalled()
}

async function uninstall() {
  const plugin = selectedInstalled.value
  const key = rowKey()
  if (!plugin || !key) return
  if (armed.value !== key) {
    armed.value = key
    say(`Press D again to uninstall ${plugin.name}`)
    return
  }
  armed.value = null
  const result = await runWorking(`Uninstalling ${plugin.name}…`, async () =>
    (await connection())?.pluginAction('uninstall', plugin.id, plugin.scope)
  )
  if (result?.error) say(`${plugin.name}: ${result.error}`, true)
  else if (result) say(result.message ?? `Uninstalled ${plugin.name}`)
  await loadInstalled()
}

// ----------------------------------------------------------------------------
// Discover
// ----------------------------------------------------------------------------

function startInstall() {
  const plugin = selectedAvailable.value
  if (!plugin) return
  if (installedIds.value.has(plugin.id)) {
    say(`${plugin.name} is already installed`)
    return
  }
  pending.value = plugin
  scopeIndex.value = 0
  mode.value = 'scope'
}

/** `approved`: run again with the marketplace command the user just saw */
async function install(scope: string, approved = false) {
  const plugin = pending.value
  if (!plugin) return
  pendingScope.value = scope
  const accept = approved ? confirmation.value?.sha256 : undefined
  mode.value = 'list'
  const result = await runWorking(`Installing ${plugin.name}…`, async () =>
    (await connection())?.pluginAction('install', plugin.id, scope, accept)
  )
  if (!result) return
  if (result.confirm && !approved) {
    confirmation.value = result.confirm
    mode.value = 'confirm'
    return
  }
  confirmation.value = undefined
  if (result.error) {
    say(`${plugin.name}: ${result.error}`, true)
    return
  }
  say(result.message ?? `Installed ${plugin.name}`)
  await loadInstalled()
}

// ----------------------------------------------------------------------------
// Marketplaces
// ----------------------------------------------------------------------------

function startAddMarketplace() {
  mode.value = 'add-marketplace'
  draft.value = ''
  message.value = ''
  nextTick(() => inputRef.value?.focus())
}

async function addMarketplace() {
  const source = draft.value.trim()
  if (!source) return
  mode.value = 'list'
  const result = await runWorking(`Adding ${source}…`, async () =>
    (await connection())?.marketplaceAction('add', source)
  )
  if (result?.error) say(result.error, true)
  else if (result) say(result.message ?? `Added ${source}`)
  availableLoaded.value = false
  await loadMarketplaces()
}

async function marketplaceAction(action: 'update' | 'remove') {
  const market = selectedMarketplace.value
  const key = rowKey()
  if (!market || !key) return
  if (action === 'remove' && armed.value !== key) {
    armed.value = key
    say(`Press D again to remove ${market.name} (its plugins stay installed)`)
    return
  }
  armed.value = null
  const label = action === 'update' ? `Updating ${market.name}…` : `Removing ${market.name}…`
  const result = await runWorking(label, async () => (await connection())?.marketplaceAction(action, market.name))
  if (result?.error) say(result.error, true)
  else if (result) say(result.message ?? (action === 'update' ? `Updated ${market.name}` : `Removed ${market.name}`))
  availableLoaded.value = false
  await loadMarketplaces()
}

// ----------------------------------------------------------------------------
// Keys
// ----------------------------------------------------------------------------

function activate() {
  if (tab.value === 'installed') void toggle()
  else if (tab.value === 'discover') startInstall()
}

function onCancel() {
  if (!working.value && mode.value !== 'list') {
    backToList()
    return
  }
  emit('close')
}

function onKey(event: KeyboardEvent) {
  if (working.value) return
  const key = event.key
  const lower = key.toLowerCase()
  let handled = true

  if (mode.value === 'scope') {
    const n = SCOPES.length
    if (key === 'ArrowDown' || key === 'j') scopeIndex.value = (scopeIndex.value + 1) % n
    else if (key === 'ArrowUp' || key === 'k') scopeIndex.value = (scopeIndex.value - 1 + n) % n
    else if (key === 'Enter') void install(SCOPES[scopeIndex.value].value)
    else if (/^[1-3]$/.test(key)) void install(SCOPES[Number(key) - 1].value)
    else handled = false
  } else if (mode.value === 'confirm') {
    if (key === 'Enter') void install(pendingScope.value, true)
    else handled = false
  } else if (mode.value === 'add-marketplace') {
    if (key === 'Enter') void addMarketplace()
    else handled = false
  } else {
    const n = rows.value.length
    const typing = tab.value === 'discover'
    if (key === 'ArrowRight' || (key === 'Tab' && !event.shiftKey)) moveTab(1)
    else if (key === 'ArrowLeft' || (key === 'Tab' && event.shiftKey)) moveTab(-1)
    else if (n > 0 && (key === 'ArrowDown' || (!typing && lower === 'j'))) index.value = (index.value + 1) % n
    else if (n > 0 && (key === 'ArrowUp' || (!typing && lower === 'k'))) index.value = (index.value - 1 + n) % n
    else if (key === 'PageDown') index.value = Math.min(Math.max(0, n - 1), index.value + 8)
    else if (key === 'PageUp') index.value = Math.max(0, index.value - 8)
    else if (key === 'Enter') activate()
    else if (typing && key === 'Backspace') query.value = query.value.slice(0, -1)
    else if (typing && key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) query.value += key
    else if (tab.value === 'installed' && (lower === 'e' || key === ' ')) void toggle()
    else if (tab.value === 'installed' && (lower === 'd' || key === 'Delete')) void uninstall()
    else if (tab.value === 'installed' && lower === 'r') void loadInstalled()
    else if (tab.value === 'marketplaces' && lower === 'a') startAddMarketplace()
    else if (tab.value === 'marketplaces' && lower === 'u') void marketplaceAction('update')
    else if (tab.value === 'marketplaces' && (lower === 'd' || key === 'Delete')) void marketplaceAction('remove')
    else handled = false
  }
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

watch(query, () => {
  index.value = 0
})

watch(index, async () => {
  if (armed.value && armed.value !== rowKey()) armed.value = null
  await nextTick()
  const row = listRef.value?.children[index.value] as HTMLElement | undefined
  row?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => {
  void loadInstalled()
})
</script>

<style scoped>
.pl-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 4px;
}

.pl-tab {
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

.pl-tab:hover {
  background: var(--cs-fg-8);
}

.pl-tab.active {
  background: var(--cs-fg-14);
  color: var(--cs-fg);
}

.pl-count {
  font-size: 11px;
  color: var(--cs-fg-36);
}

.pl-query {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.pl-content {
  height: 264px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Takes the room left in .pl-content and scrolls; a short list leaves it empty below */
.pl-list {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.pl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.pl-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.pl-num {
  width: 10px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.pl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--cs-fg-20);
}

.pl-dot.on {
  background: var(--vscode-testing-iconPassed, #3fb950);
}

.pl-name {
  flex-shrink: 0;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.pl-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.pl-badge {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--cs-fg-8);
  font-size: 10px;
  line-height: 15px;
  color: var(--cs-fg-66);
}

/* Install count: fixed-width right column, so the numbers line up */
.pl-stat {
  flex-shrink: 0;
  width: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--cs-fg-36);
}

.pl-stat .codicon {
  font-size: 12px;
}

.pl-more {
  padding: 4px 6px 2px;
  text-align: center;
  font-size: 11px;
  color: var(--cs-fg-36);
}

/* Selected plugin, apart from the list */
.pl-info {
  flex-shrink: 0;
  margin-top: auto;
  padding: 6px 6px 0;
  border-top: 1px solid var(--cs-fg-8);
}

.pl-info-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.pl-info-name {
  font-weight: 600;
  color: var(--cs-fg);
}

.pl-info-head .pl-muted {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-description {
  /* Two lines kept, so moving through the list does not make the panel jump */
  min-height: 32px;
  color: var(--cs-fg-66);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pl-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pl-command {
  margin: 0;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--cs-fg-8);
  font-family: var(--vscode-editor-font-family, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 120px;
  overflow-y: auto;
  user-select: text;
}

.pl-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pl-input {
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

.pl-input:focus {
  border-color: var(--cs-fg-36);
}

.pl-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.pl-muted {
  color: var(--cs-fg-36);
}

.pl-pad {
  padding: 2px 6px;
}

.pl-empty {
  padding-top: 24px;
  text-align: center;
  color: var(--cs-fg-36);
}

.pl-note {
  flex-shrink: 0;
  margin-top: 4px;
  max-height: 64px;
  overflow-y: auto;
  color: var(--cs-fg-36);
  overflow-wrap: anywhere;
  white-space: pre-line;
  user-select: text;
}

.pl-note.error {
  color: var(--vscode-errorForeground);
}
</style>
