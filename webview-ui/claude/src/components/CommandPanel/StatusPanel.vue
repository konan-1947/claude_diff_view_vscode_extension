<template>
  <!-- `/status`: what the CLI's Status screen shows (version, session, account,
       model, MCP, settings and memory files). Read-only; through the SDK the
       command "isn't available in this environment". -->
  <CommandPanel
    title="Status"
    :subtitle="status?.version ? `Claude Code v${status.version}` : ''"
    :actions="actions"
    :hint="['↑/↓ to scroll', 'S open user settings', 'Esc to close']"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div v-if="loading && !status" class="sp-empty">Loading…</div>
    <div v-else-if="errorText" class="sp-error">{{ errorText }}</div>
    <div v-else-if="status" ref="bodyRef" class="sp-body">
      <template v-for="section in sections" :key="section.title">
        <div class="sp-section">{{ section.title }}</div>
        <div v-for="row in section.rows" :key="section.title + row.label" class="sp-row">
          <span class="sp-label">{{ row.label }}</span>
          <span :class="['sp-value', { muted: row.muted }]" :title="row.value">{{ row.value }}</span>
        </div>
      </template>
    </div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { ClaudeFileKind, StatusInfo } from '@shared/messages'

const emit = defineEmits<{ (e: 'close'): void }>()

const runtime = inject(RuntimeKey)

const status = ref<StatusInfo>()
const loading = ref(false)
const errorText = ref('')
const bodyRef = ref<HTMLDivElement>()

interface Row {
  label: string
  value: string
  muted?: boolean
}

const FILE_LABELS: Record<ClaudeFileKind, string> = {
  'user-settings': 'User',
  'project-settings': 'Project',
  'local-settings': 'Local',
  'user-memory': 'User',
  'project-memory': 'Project',
  'local-memory': 'Local',
}

const NOT_YET = 'shown after the first message'

function accountRows(s: StatusInfo): Row[] {
  const a = s.account
  const rows: Row[] = []
  if (a?.email) rows.push({ label: 'Email', value: a.email })
  if (a?.organization) rows.push({ label: 'Organization', value: a.organization })
  if (a?.subscriptionType) rows.push({ label: 'Plan', value: a.subscriptionType })
  if (a?.apiProvider && a.apiProvider !== 'firstParty') rows.push({ label: 'API provider', value: a.apiProvider })
  const auth = a?.tokenSource || a?.apiKeySource || s.apiKeySource
  if (auth && auth !== 'none') rows.push({ label: 'Auth', value: auth })
  if (rows.length === 0) rows.push({ label: 'Account', value: 'not reported by the CLI', muted: true })
  return rows
}

const sections = computed(() => {
  const s = status.value
  if (!s) return []
  const connected = s.mcpServers.filter((m) => m.status === 'connected').length
  return [
    {
      title: 'Session',
      rows: [
        { label: 'Version', value: s.version ?? NOT_YET, muted: !s.version },
        { label: 'Working directory', value: s.cwd },
        { label: 'Model', value: s.model ?? NOT_YET, muted: !s.model },
        { label: 'Permission mode', value: s.permissionMode ?? NOT_YET, muted: !s.permissionMode },
        { label: 'Output style', value: s.outputStyle ?? 'default' },
      ],
    },
    { title: 'Account', rows: accountRows(s) },
    {
      title: 'MCP servers',
      rows: s.mcpServers.length
        ? [
            { label: 'Connected', value: `${connected}/${s.mcpServers.length}` },
            ...s.mcpServers.map((m) => ({
              label: m.name,
              value: m.status === 'failed' && m.error ? `failed: ${m.error}` : m.status,
              muted: m.status !== 'connected',
            })),
          ]
        : [{ label: 'Servers', value: 'none', muted: true }],
    },
    ...(s.plugins.length
      ? [{
          title: 'Plugins',
          rows: s.plugins.map((p) => ({ label: p.name, value: p.version ?? '' })),
        }]
      : []),
    {
      title: 'Settings files',
      rows: s.settingsFiles.map((f) => ({
        label: FILE_LABELS[f.kind],
        value: f.exists ? f.path : `${f.path} (none)`,
        muted: !f.exists,
      })),
    },
    {
      title: 'Memory',
      rows: s.memoryFiles.length
        ? s.memoryFiles.map((f) => ({ label: FILE_LABELS[f.kind], value: f.path }))
        : [{ label: 'CLAUDE.md', value: 'none (create one with /memory)', muted: true }],
    },
  ] as { title: string; rows: Row[] }[]
})

async function refresh() {
  const session = runtime?.sessionStore.activeSession()
  if (!session) return
  loading.value = true
  errorText.value = ''
  try {
    status.value = await session.getStatus()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function openUserSettings() {
  const connection = await runtime?.connectionManager.get()
  const error = await connection?.openClaudeFile('user-settings')
  if (error) errorText.value = error
  else emit('close')
}

function onKey(event: KeyboardEvent) {
  const body = bodyRef.value
  const key = event.key
  let handled = true
  if (key === 'ArrowDown' || key === 'j') body?.scrollBy({ top: 20 })
  else if (key === 'ArrowUp' || key === 'k') body?.scrollBy({ top: -20 })
  else if (key === 'PageDown' || key === ' ') body?.scrollBy({ top: 160 })
  else if (key === 'PageUp') body?.scrollBy({ top: -160 })
  else if (key.toLowerCase() === 's') void openUserSettings()
  else if (key.toLowerCase() === 'r') void refresh()
  else handled = false
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const actions = computed<CommandPanelAction[]>(() => [
  { label: 'Refresh', key: 'R', run: () => void refresh() },
  { label: 'User settings', key: 'S', run: () => void openUserSettings() },
])

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
/* One grid for every section, so labels line up: the label column is as wide
   as the longest label, up to half the viewport; values wrap instead of being cut. */
.sp-body {
  display: grid;
  grid-template-columns: fit-content(50vw) minmax(0, 1fr);
  column-gap: 12px;
  max-height: 260px;
  overflow-y: auto;
  user-select: text;
}

.sp-section {
  grid-column: 1 / -1;
  margin-top: 6px;
  padding: 0 6px 2px;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.sp-section:first-child {
  margin-top: 0;
}

.sp-row {
  display: contents;
}

.sp-label {
  padding: 2px 0 2px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-66);
}

.sp-value {
  padding: 2px 6px 2px 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.sp-value.muted {
  color: var(--cs-fg-36);
}

.sp-empty {
  text-align: center;
  color: var(--cs-fg-36);
}

.sp-error {
  color: var(--vscode-errorForeground);
  overflow-wrap: anywhere;
}
</style>
