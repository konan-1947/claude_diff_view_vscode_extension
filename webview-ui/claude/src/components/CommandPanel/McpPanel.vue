<template>
  <!-- `/mcp`: the session's MCP servers with their status, and the CLI's
       reconnect / enable / disable actions (SDK control requests, so no chat
       message per click). -->
  <CommandPanel
    ref="panelRef"
    title="MCP servers"
    :subtitle="subtitle"
    :actions="actions"
    :hint="['↑/↓ to select', 'R reconnect', 'E enable/disable', 'Esc to close']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div v-if="loading && servers.length === 0" class="mp-empty">Loading…</div>
    <div v-else-if="servers.length === 0" class="mp-empty">
      No MCP servers configured. Add one with <code>claude mcp add</code> in a terminal.
    </div>
    <div v-else class="mp-list" role="listbox">
      <div
        v-for="(server, i) in servers"
        :key="server.name"
        role="option"
        :aria-selected="i === index"
        :class="['mp-row', { active: i === index }]"
        @mousedown.prevent
        @click="index = i"
      >
        <span :class="['mp-dot', statusClass(server.status)]" />
        <span class="mp-name">{{ server.name }}</span>
        <span class="mp-status">
          {{ working === server.name ? 'working…' : statusLabel(server) }}
        </span>
        <span v-if="server.scope" class="mp-scope">{{ server.scope }}</span>
      </div>
    </div>
    <div v-if="errorText" class="mp-error">{{ errorText }}</div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { McpServerInfo } from '@shared/messages'

const emit = defineEmits<{ (e: 'close'): void }>()

const runtime = inject(RuntimeKey)
const panelRef = ref<InstanceType<typeof CommandPanel>>()

const servers = ref<McpServerInfo[]>([])
const index = ref(0)
const loading = ref(false)
const working = ref<string | null>(null)
const errorText = ref('')

const selected = computed(() => servers.value[index.value])

const subtitle = computed(() => {
  const n = servers.value.length
  const connected = servers.value.filter((s) => s.status === 'connected').length
  return n ? `${connected}/${n} connected` : ''
})

function session() {
  return runtime?.sessionStore.activeSession()
}

async function refresh() {
  const s = session()
  if (!s) return
  loading.value = true
  try {
    const list = await s.getMcpServers()
    const keep = selected.value?.name
    servers.value = list
    const at = keep ? list.findIndex((x) => x.name === keep) : -1
    index.value = at >= 0 ? at : Math.min(index.value, Math.max(0, list.length - 1))
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function run(action: 'reconnect' | 'enable' | 'disable') {
  const s = session()
  const server = selected.value
  if (!s || !server || working.value) return
  working.value = server.name
  errorText.value = ''
  try {
    const error = await s.mcpServerAction(action, server.name)
    if (error) errorText.value = `${server.name}: ${error}`
  } catch (error) {
    errorText.value = `${server.name}: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    working.value = null
    await refresh()
    panelRef.value?.focus()
  }
}

const isDisabled = computed(() => selected.value?.status === 'disabled')

function toggle() {
  void run(isDisabled.value ? 'enable' : 'disable')
}

function statusClass(status: string): string {
  if (status === 'connected') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'needs-auth' || status === 'pending') return 'warn'
  return 'off'
}

function statusLabel(server: McpServerInfo): string {
  if (server.status === 'connected') {
    return server.toolCount != null ? `connected, ${server.toolCount} tools` : 'connected'
  }
  if (server.status === 'failed' && server.error) return `failed: ${server.error}`
  return server.status
}

function onKey(event: KeyboardEvent) {
  const n = servers.value.length
  const key = event.key.toLowerCase()
  let handled = true
  if (n > 0 && (key === 'arrowdown' || key === 'j')) index.value = (index.value + 1) % n
  else if (n > 0 && (key === 'arrowup' || key === 'k')) index.value = (index.value - 1 + n) % n
  else if (key === 'r') void run('reconnect')
  else if (key === 'e' || key === ' ') toggle()
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const actions = computed<CommandPanelAction[]>(() =>
  selected.value
    ? [
        { label: 'Reconnect', key: 'R', run: () => void run('reconnect') },
        { label: isDisabled.value ? 'Enable' : 'Disable', key: 'E', run: toggle },
      ]
    : []
)

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.mp-list {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
}

.mp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.mp-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.mp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--cs-fg-20);
}

.mp-dot.ok {
  background: var(--vscode-testing-iconPassed, #3fb950);
}

.mp-dot.bad {
  background: var(--vscode-errorForeground, #f14c4c);
}

.mp-dot.warn {
  background: var(--vscode-editorWarning-foreground, #cca700);
}

.mp-name {
  flex-shrink: 0;
}

.mp-status {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.mp-scope {
  font-size: 11px;
  color: var(--cs-fg-36);
}

.mp-empty {
  text-align: center;
  color: var(--cs-fg-36);
}

.mp-error {
  margin-top: 4px;
  color: var(--vscode-errorForeground);
  overflow-wrap: anywhere;
}
</style>
