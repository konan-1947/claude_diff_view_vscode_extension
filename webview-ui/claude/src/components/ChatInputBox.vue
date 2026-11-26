<template>
  <!-- Input box - three-row layout -->
  <div :class="['full-input-box', { 'bash-mode': bashMode && !activePanel }]" style="position: relative;">
    <!-- Command panel (`/effort` …): takes the input's place inside the same frame while open -->
    <EffortPanel
      v-if="activePanel === 'effort'"
      :effort-level="effortLevel"
      :auto-level="autoEffortLevel"
      :levels="effortLevels"
      @select="(level, persist) => emit('effortSelect', level, persist)"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'output-style'"
      title="Output style"
      :items="outputStyleItems"
      :loading="outputStylesLoading"
      empty-text="The CLI listed no output styles"
      @select="(style) => runCommand(`/output-style ${style}`)"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'autocompact'"
      title="Auto-compact window"
      :items="AUTOCOMPACT_ITEMS"
      :hint="['↑/↓ to select', 'Enter to confirm', 'other sizes: /autocompact <tokens>']"
      @select="(value) => runCommand(`/autocompact ${value}`)"
      @close="closePanel"
    />
    <TextPanel
      v-else-if="activePanel === 'rename'"
      title="Rename conversation"
      placeholder="New name"
      submit-label="Rename"
      :actions="[{ label: 'Generate', run: () => { runCommand('/rename'); closePanel() } }]"
      note="Generate lets Claude name it from the conversation."
      @submit="(name) => runCommand(`/rename ${name}`)"
      @close="closePanel"
    />
    <TextPanel
      v-else-if="activePanel === 'goal'"
      title="Goal"
      placeholder="Condition to keep working toward, e.g. all tests pass"
      note="Claude keeps working until the condition is met."
      @submit="(condition) => runCommand(`/goal ${condition}`)"
      @close="closePanel"
    />
    <ConfigPanel
      v-else-if="activePanel === 'config'"
      @run="(commands) => emit('runCommands', commands)"
      @open-file="openSettingsFile"
      @close="closePanel"
    />
    <McpPanel v-else-if="activePanel === 'mcp'" @close="closePanel" />
    <AutoModeSetupPanel
      v-else-if="activePanel === 'auto-mode-setup'"
      @run="runCommand"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'resume'"
      title="Resume conversation"
      :items="resumeItems"
      :loading="resumeLoading"
      :initial-query="panelArg"
      filterable
      empty-text="No earlier conversations in this workspace"
      :actions="[{ label: 'All chats', run: openHistory }]"
      @select="resumeSession"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'memory'"
      title="Memory"
      :items="memoryItems"
      :loading="memoryLoading"
      note="Opens the file in the editor (a missing one is created)."
      @select="openMemoryFile"
      @close="closePanel"
    />
    <StatusPanel v-else-if="activePanel === 'status'" @close="closePanel" />
    <ListPanel
      v-else-if="activePanel === 'export'"
      title="Export conversation"
      :items="EXPORT_ITEMS"
      @select="(target) => exportConversation(target as 'file' | 'clipboard')"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'hooks'"
      title="Hooks"
      :subtitle="hookItems.length ? `${hookItems.length} configured` : ''"
      :items="hookItems"
      :loading="hooksLoading"
      :note="hooksNote"
      filterable
      empty-text="No hooks in the user, project or local settings"
      :hint="['↑/↓ to select', 'type to filter', 'Enter to open its settings file', 'Esc to close']"
      @select="openHookSource"
      @close="closePanel"
    />
    <HelpPanel v-else-if="activePanel === 'help'" @pick="pickFromHelp" @close="closePanel" />
    <PermissionsPanel
      v-else-if="activePanel === 'permissions'"
      @add-directory="() => void startAddDirectory('')"
      @close="closePanel"
    />
    <ListPanel
      v-else-if="activePanel === 'add-dir'"
      title="Add directory"
      :subtitle="addDirPath"
      :items="ADD_DIR_ITEMS"
      note="Claude can then read and edit files in this directory. The conversation restarts in place to pick it up."
      @select="(choice) => void confirmAddDirectory(choice)"
      @close="closePanel"
    />
    <PluginPanel v-else-if="activePanel === 'plugin'" @close="closePanel" />
    <ListPanel
      v-else-if="activePanel === 'history-search'"
      title="Search prompts"
      :items="historyItems"
      :initial-query="panelArg"
      filterable
      empty-text="No prompts typed in this project yet"
      :hint="['↑/↓ to select', 'type to search', 'Enter to use', 'Esc to cancel']"
      @select="useHistoryEntry"
      @close="closePanel"
    />
    <RewindPanel
      v-else-if="activePanel === 'rewind'"
      :targets="rewindTargets"
      :initial-target="rewindInitial"
      @restored="restoreRewoundText"
      @notify="notify"
      @close="closePanel"
    />
    <AuthPanel
      v-else-if="activePanel === 'login' || activePanel === 'logout'"
      :key="activePanel"
      :mode="activePanel"
      @switch-mode="(mode) => (activePanel = mode)"
      @close="closePanel"
    />

    <!-- Attachment list (if any) -->
    <div v-if="attachments && attachments.length > 0" v-show="!activePanel" class="attachments-list">
      <template v-for="attachment in attachments" :key="attachment.id">
      <!-- Images: thumbnail, click to open the full-size popup -->
      <div
        v-if="isImageAttachment(attachment)"
        class="attachment-thumb"
        :title="attachment.fileName"
        @click="openPreview(attachment)"
      >
        <img :src="attachmentSrc(attachment)" :alt="attachment.fileName" />
        <button
          class="thumb-remove"
          @click.stop="handleRemoveAttachment(attachment.id)"
          :aria-label="`Remove ${attachment.fileName}`"
        >
          <span class="codicon codicon-close" />
        </button>
      </div>
      <div
        v-else
        class="attachment-item"
      >
        <div class="icon-wrapper">
          <div class="attachment-icon">
            <FileIcon :file-name="attachment.fileName" :size="16" />
          </div>
          <button
            class="remove-button"
            @click.stop="handleRemoveAttachment(attachment.id)"
            :aria-label="`Remove ${attachment.fileName}`"
          >
            <span class="codicon codicon-close" />
          </button>
        </div>
        <span class="attachment-name">{{ attachment.fileName }}</span>
      </div>
      </template>
    </div>
    <ImageLightbox
      :src="preview ? attachmentSrc(preview) : null"
      :alt="preview?.fileName"
      @close="preview = null"
    />

    <!-- Row 1: input area -->
    <div
      v-show="!activePanel"
      ref="textareaRef"
      contenteditable="true"
      class="aislash-editor-input custom-scroll-container"
      :data-placeholder="placeholder"
      :style="{ minHeight: INPUT_MIN_HEIGHT + 'px', height: INPUT_MIN_HEIGHT + 'px' }"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @dragover="handleDragOver"
      @drop="handleDrop"
    />

    <!-- Row 2: ButtonArea component + TokenIndicator -->
    <ButtonArea
      v-show="!activePanel"
      ref="buttonAreaRef"
      :disabled="isSubmitDisabled"
      :loading="isLoading"
      :selected-model="selectedModel"
      :conversation-working="conversationWorking"
      :has-input-content="!!content.trim()"
      :show-progress="showProgress"
      :progress-percentage="progressPercentage"
      :context-tooltip="contextTooltip"
      :thinking-level="thinkingLevel"
      :permission-mode="permissionMode"
      :modes="modes"
      :show-thinking-toggle="showThinkingToggle"
      :effort-level="effortLevel"
      :effort-levels="effortLevels"
      @submit="handleSubmit"
      @stop="handleStop"
      @add-attachment="handleAddFiles"
      @mention="handleMention"
      @thinking-toggle="() => emit('thinkingToggle')"
      @effort-select="(level) => emit('effortSelect', level)"
      @mode-select="(mode) => emit('modeSelect', mode)"
      @model-select="(modelId) => emit('modelSelect', modelId)"
    />

    <!-- Slash Command Dropdown -->
    <Dropdown
      v-if="slashCompletion.isOpen.value"
      :is-visible="slashCompletion.isOpen.value"
      :position="slashCompletion.position.value"
      fit-content
      :min-width="320"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="slashCompletion.navigationMode.value"
      :selected-index="slashCompletion.activeIndex.value"
      :offset-y="6"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="slashCompletion.close"
    >
      <template #content>
        <div @mouseleave="slashCompletion.handleMouseLeave">
          <template v-if="slashCompletion.items.value.length > 0">
            <template v-for="(item, index) in slashCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === slashCompletion.activeIndex.value"
                stacked
                clamp-detail
                @click="slashCompletion.selectActive()"
                @mouseenter="slashCompletion.handleMouseEnter(index)"
              />
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>

    <!-- @ file reference Dropdown -->
    <Dropdown
      v-if="fileCompletion.isOpen.value"
      :is-visible="fileCompletion.isOpen.value"
      :position="fileCompletion.position.value"
      :width="320"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="fileCompletion.navigationMode.value"
      :selected-index="fileCompletion.activeIndex.value"
      :offset-y="6"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="fileCompletion.close"
    >
      <template #content>
        <div @mouseleave="fileCompletion.handleMouseLeave">
          <template v-if="fileCompletion.items.value.length > 0">
            <template v-for="(item, index) in fileCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === fileCompletion.activeIndex.value"
                @click="fileCompletion.selectActive()"
                @mouseenter="fileCompletion.handleMouseEnter(index)"
              >
                <template #icon v-if="'data' in item && item.data?.file">
                  <FileIcon
                    :file-name="item.data.file.name"
                    :is-directory="item.data.file.type === 'directory'"
                    :folder-path="item.data.file.path"
                    :size="16"
                  />
                </template>
              </DropdownItem>
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, inject, onMounted, onUnmounted } from 'vue'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import FileIcon from './FileIcon.vue'
import ButtonArea from './ButtonArea.vue'
import EffortPanel from './CommandPanel/EffortPanel.vue'
import ListPanel, { type ListPanelItem } from './CommandPanel/ListPanel.vue'
import TextPanel from './CommandPanel/TextPanel.vue'
import McpPanel from './CommandPanel/McpPanel.vue'
import ConfigPanel from './CommandPanel/ConfigPanel.vue'
import AutoModeSetupPanel from './CommandPanel/AutoModeSetupPanel.vue'
import StatusPanel from './CommandPanel/StatusPanel.vue'
import HelpPanel from './CommandPanel/HelpPanel.vue'
import PermissionsPanel from './CommandPanel/PermissionsPanel.vue'
import PluginPanel from './CommandPanel/PluginPanel.vue'
import AuthPanel from './CommandPanel/AuthPanel.vue'
import RewindPanel from './CommandPanel/RewindPanel.vue'
import type { ClaudeFileKind } from '@shared/messages'
import type { Message } from '../models/Message'
import { usePromptHistory } from '../utils/promptHistory'
import { transcriptToMarkdown, exportFileName } from '../utils/exportTranscript'
import { IMAGE_MEDIA_TYPES, type AttachmentItem } from '../types/attachment'
import ImageLightbox from './Common/ImageLightbox.vue'
import type { ModeOption } from '../utils/permissionModes'
import { Dropdown, DropdownItem } from './Dropdown'
import { RuntimeKey } from '../composables/runtimeContext'
import { useCompletionDropdown } from '../composables/useCompletionDropdown'
import { getSlashCommands, commandToDropdownItem } from '../providers/slashCommandProvider'
import { getFileReferences, fileToDropdownItem } from '../providers/fileReferenceProvider'

interface Props {
  showProgress?: boolean
  progressPercentage?: number
  contextTooltip?: string
  placeholder?: string
  readonly?: boolean
  showSearch?: boolean
  selectedModel?: string
  conversationWorking?: boolean
  /** Prompts wait in the queue: ↑ takes them back into the input to edit */
  hasQueued?: boolean
  /** Background tasks are listed below the input: ↓ moves into that list */
  hasTasksBelow?: boolean
  attachments?: AttachmentItem[]
  thinkingLevel?: string
  permissionMode?: PermissionMode
  modes?: ModeOption[]
  showThinkingToggle?: boolean
  effortLevel?: string
  /** What "auto" resolves to right now (the CLI's applied effort), if known */
  autoEffortLevel?: string | null
  effortLevels?: string[]
}

interface Emits {
  (e: 'submit', content: string): void
  (e: 'queueMessage', content: string): void
  /** Several commands from one panel (`/config`), sent in order even while busy */
  (e: 'runCommands', commands: string[]): void
  (e: 'stop'): void
  (e: 'editQueued'): void
  (e: 'focusTasks'): void
  (e: 'input', content: string): void
  (e: 'attach'): void
  (e: 'addAttachment', files: FileList): void
  (e: 'removeAttachment', id: string): void
  (e: 'thinkingToggle'): void
  /** persist: also save as the model's default (Enter in the /effort panel) */
  (e: 'effortSelect', level: string, persist?: boolean): void
  (e: 'modeSelect', mode: PermissionMode): void
  (e: 'modelSelect', modelId: string): void
  /** A command panel opened: the page refreshes what it shows (e.g. applied effort) */
  (e: 'commandPanelOpen', panel: 'effort'): void
  /** `/resume` → "All chats": show the chat history page */
  (e: 'openHistory'): void
  /** `!command` (bash mode): the command without the `!` */
  (e: 'bash', command: string): void
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: true,
  progressPercentage: 48.7,
  contextTooltip: '',
  placeholder: 'Plan, @ for context, / for commands, ! for bash',
  readonly: false,
  showSearch: false,
  selectedModel: 'default',
  conversationWorking: false,
  attachments: () => [],
  thinkingLevel: 'default_on',
  permissionMode: 'default',
  modes: () => [],
  showThinkingToggle: true,
  effortLevel: 'auto',
  effortLevels: () => []
})

const emit = defineEmits<Emits>()

const runtime = inject(RuntimeKey)

// Empty input is three 22px lines tall (Cursor-like), grows up to the max
const INPUT_MIN_HEIGHT = 110
const INPUT_MAX_HEIGHT = 360

const content = ref('')
const isLoading = ref(false)
const textareaRef = ref<HTMLDivElement | null>(null)

const buttonAreaRef = ref<InstanceType<typeof ButtonArea>>()

// Commands that are a menu in the CLI open a picker or panel when typed bare;
// through the SDK the CLI would only print usage text (or, for `/rename`, fail
// to generate a name). With an argument they go to the CLI as typed. Deferred
// so the click that picked the completion item does not reach the picker's
// click-outside handler and close it straight away. Returns false when there
// is no picker for it (a model without effort levels): the command then goes
// to the CLI as typed.
type PanelName =
  | 'effort'
  | 'output-style'
  | 'autocompact'
  | 'rename'
  | 'goal'
  | 'config'
  | 'mcp'
  | 'auto-mode-setup'
  | 'resume'
  | 'memory'
  | 'status'
  | 'export'
  | 'hooks'
  | 'help'
  | 'permissions'
  | 'add-dir'
  | 'plugin'
  | 'login'
  | 'logout'
  | 'history-search'
  | 'rewind'

const PANEL_COMMANDS: Record<string, PanelName> = {
  '/output-style': 'output-style',
  '/autocompact': 'autocompact',
  '/rename': 'rename',
  '/name': 'rename',
  '/goal': 'goal',
  '/config': 'config',
  '/settings': 'config',
  '/mcp': 'mcp',
  '/auto-mode-setup': 'auto-mode-setup',
}

// Commands the CLI cannot run through the SDK ("isn't available in this
// environment"): always answered here, with or without an argument.
const UI_PANEL_COMMANDS: Record<string, PanelName> = {
  '/resume': 'resume',
  '/memory': 'memory',
  '/status': 'status',
  '/export': 'export',
  '/hooks': 'hooks',
  '/help': 'help',
  '/permissions': 'permissions',
  '/allowed-tools': 'permissions',
  '/add-dir': 'add-dir',
  '/plugin': 'plugin',
  '/plugins': 'plugin',
  '/login': 'login',
  '/logout': 'logout',
}

// UI commands that do their job at once, without a panel
const UI_ACTION_COMMANDS: Record<string, () => void> = {
  '/release-notes': () => void openReleaseNotes(),
  // The CLI's checkpoint menu (also Esc Esc); /undo and /checkpoint are its aliases
  '/rewind': () => openRewind(),
  '/undo': () => openRewind(),
  '/checkpoint': () => openRewind(),
}

/** Argument typed after a UI command (`/resume <name>`, `/export <file>`) */
const panelArg = ref('')

function openUiPanel(command: string): boolean {
  const match = /^(\/\S+)(?:\s+([\s\S]*))?$/.exec(command.trim())
  const name = match?.[1].toLowerCase() ?? ''
  const action = UI_ACTION_COMMANDS[name]
  if (action) {
    clearInput()
    action()
    return true
  }
  const panel = UI_PANEL_COMMANDS[name]
  if (!panel) return false
  const arg = (match?.[2] ?? '').trim()
  clearInput()
  panelArg.value = arg
  if (panel === 'add-dir') {
    void startAddDirectory(arg)
    return true
  }
  if (panel === 'resume' && arg && resumeByArg(arg)) return true
  if (panel === 'export' && arg) {
    void exportConversation('file', arg)
    return true
  }
  activePanel.value = panel
  if (panel === 'resume') void loadSessions()
  else if (panel === 'memory') void loadMemoryFiles()
  else if (panel === 'hooks') void loadHooks()
  return true
}

function openPickerFor(command: string): boolean {
  if (openUiPanel(command)) return true
  const name = command.toLowerCase()
  if (name === '/model') {
    clearInput()
    setTimeout(() => buttonAreaRef.value?.openModelSelect(), 0)
    return true
  }
  if (name === '/effort' && props.effortLevels.length > 0) {
    clearInput()
    activePanel.value = 'effort'
    emit('commandPanelOpen', 'effort')
    return true
  }
  const panel = PANEL_COMMANDS[name]
  if (panel) {
    clearInput()
    activePanel.value = panel
    if (panel === 'output-style') void loadOutputStyles()
    return true
  }
  return false
}

/** Command panel shown in place of the input (null = the input itself) */
const activePanel = ref<PanelName | null>(null)

/** A panel's command goes the way a typed one does (queued while busy) */
function runCommand(text: string) {
  if (props.conversationWorking) {
    emit('queueMessage', text)
  } else {
    emit('submit', text)
  }
}

// `/output-style`: the CLI's list, the current style checked
const outputStyleItems = ref<ListPanelItem[]>([])
const outputStylesLoading = ref(false)

async function loadOutputStyles() {
  const session = runtime?.sessionStore.activeSession()
  outputStyleItems.value = []
  if (!session) return
  outputStylesLoading.value = true
  try {
    const { current, available } = await session.getOutputStyles()
    outputStyleItems.value = available.map((style) => ({
      value: style,
      label: style,
      current: style.toLowerCase() === (current ?? 'default').toLowerCase(),
    }))
  } catch (error) {
    console.warn('[ChatInputBox] output styles failed:', error)
  } finally {
    outputStylesLoading.value = false
  }
}

// `/autocompact [auto|<tokens>]`; the CLI checks the size (at least 100K)
const AUTOCOMPACT_ITEMS: ListPanelItem[] = [
  { value: 'auto', label: 'Auto', detail: 'window tuned for the model' },
  { value: '100000', label: '100K tokens' },
  { value: '200000', label: '200K tokens' },
  { value: '400000', label: '400K tokens' },
  { value: '1000000', label: '1M tokens' },
]

async function connection() {
  return runtime?.connectionManager.get()
}

function notify(message: string, severity: 'info' | 'warning' | 'error' = 'info') {
  void runtime?.appContext.showNotification(message, severity)
}

// `/resume`: conversations of this workspace, newest first
const resumeItems = ref<ListPanelItem[]>([])
const resumeLoading = ref(false)

function relativeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const minutes = Math.floor((Date.now() - ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

function buildResumeItems() {
  const store = runtime?.sessionStore
  if (!store) return
  const active = store.activeSession()
  resumeItems.value = store
    .sessionsByLastModified()
    .filter((s) => !!s.sessionId())
    .map((s) => {
      const count = s.messageCount()
      return {
        value: s.sessionId()!,
        label: s.summary() || 'New Conversation',
        detail: [relativeTime(s.lastModifiedTime()), count ? `${count} messages` : '']
          .filter(Boolean)
          .join('   '),
        current: s === active,
      }
    })
}

async function loadSessions() {
  buildResumeItems()
  resumeLoading.value = resumeItems.value.length === 0
  try {
    await runtime?.sessionStore.listSessions()
  } catch (error) {
    console.warn('[ChatInputBox] session list failed:', error)
  } finally {
    resumeLoading.value = false
    buildResumeItems()
  }
}

function resumeSession(sessionId: string) {
  const store = runtime?.sessionStore
  const target = store?.sessions().find((s) => s.sessionId() === sessionId)
  if (store && target && target !== store.activeSession()) {
    void store.openExisting(target)
  }
}

/** `/resume <id or name>`: switch straight away when exactly one matches */
function resumeByArg(arg: string): boolean {
  const store = runtime?.sessionStore
  if (!store) return false
  const q = arg.toLowerCase()
  const sessions = store.sessions().filter((s) => !!s.sessionId())
  const byId = sessions.filter((s) => s.sessionId()!.toLowerCase().startsWith(q))
  const byName = sessions.filter((s) => (s.summary() ?? '').toLowerCase() === q)
  const found = byId.length === 1 ? byId : byName.length === 1 ? byName : []
  if (found.length !== 1) return false
  resumeSession(found[0].sessionId()!)
  return true
}

function openHistory() {
  closePanel()
  emit('openHistory')
}

// `/memory`: the CLI's CLAUDE.md files, opened (or created) in the editor
const memoryItems = ref<ListPanelItem[]>([])
const memoryLoading = ref(false)
const MEMORY_LABELS: Partial<Record<ClaudeFileKind, string>> = {
  'project-memory': 'Project memory',
  'local-memory': 'Project memory (local)',
  'user-memory': 'User memory',
}
const MEMORY_NOTES: Partial<Record<ClaudeFileKind, string>> = {
  'project-memory': 'checked in',
  'local-memory': 'not checked in',
  'user-memory': 'all projects',
}

async function loadMemoryFiles() {
  memoryLoading.value = true
  memoryItems.value = []
  try {
    const files = (await (await connection())?.getMemoryFiles()) ?? []
    memoryItems.value = files.map((f) => ({
      value: f.kind,
      label: MEMORY_LABELS[f.kind] ?? f.kind,
      detail: f.path,
      tag: f.exists ? MEMORY_NOTES[f.kind] : 'new file',
    }))
  } catch (error) {
    console.warn('[ChatInputBox] memory files failed:', error)
  } finally {
    memoryLoading.value = false
  }
}

async function openMemoryFile(kind: string) {
  const error = await (await connection())?.openClaudeFile(kind as ClaudeFileKind, true)
  if (error) notify(error, 'error')
}

// `/hooks`: read-only list; Enter opens the settings file the hook is in
const hookItems = ref<ListPanelItem[]>([])
const hooksLoading = ref(false)
const hooksNote = ref('')
const SOURCE_LABELS: Partial<Record<ClaudeFileKind, string>> = {
  'user-settings': 'user',
  'project-settings': 'project',
  'local-settings': 'local',
}

async function loadHooks() {
  hooksLoading.value = true
  hookItems.value = []
  hooksNote.value = ''
  try {
    const result = await (await connection())?.getHooks()
    hookItems.value = (result?.hooks ?? []).map((hook, i) => ({
      value: `${i}:${hook.source}`,
      label: hook.matcher ? `${hook.event} (${hook.matcher})` : hook.event,
      detail: hook.hookType === 'command' ? hook.command : `${hook.hookType}: ${hook.command}`,
      tag: SOURCE_LABELS[hook.source],
    }))
    hooksNote.value = (result?.errors ?? [])
      .map((e) => `${SOURCE_LABELS[e.source]} settings could not be read: ${e.error}`)
      .join('\n')
  } catch (error) {
    hooksNote.value = error instanceof Error ? error.message : String(error)
  } finally {
    hooksLoading.value = false
  }
}

async function openHookSource(value: string) {
  const kind = value.slice(value.indexOf(':') + 1) as ClaudeFileKind
  const error = await (await connection())?.openClaudeFile(kind)
  if (error) notify(error, 'error')
}

// `/export`: like the CLI's menu, to a file or the clipboard
const EXPORT_ITEMS: ListPanelItem[] = [
  { value: 'file', label: 'Save to file', detail: 'markdown, through a save dialog' },
  { value: 'clipboard', label: 'Copy to clipboard' },
]

async function exportConversation(target: 'file' | 'clipboard', fileName?: string) {
  const session = runtime?.sessionStore.activeSession()
  const messages = session?.messages() ?? []
  if (!session || messages.length === 0) {
    notify('Nothing to export yet', 'warning')
    return
  }
  const title = session.summary()
  const markdown = transcriptToMarkdown(messages, title)
  const name = fileName
    ? (/\.(md|txt)$/i.test(fileName) ? fileName : `${fileName}.md`)
    : exportFileName(title)
  try {
    const path = await (await connection())?.exportConversation(markdown, target, name)
    if (target === 'clipboard') notify('Conversation copied to clipboard')
    else if (path) notify(`Conversation exported to ${path}`)
  } catch (error) {
    notify(`Export failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// `/add-dir [path]`: resolve the folder (no path: a folder picker), then ask
// whether it is for this session only or saved for the project, like the CLI
const addDirPath = ref('')
const ADD_DIR_ITEMS: ListPanelItem[] = [
  { value: 'session', label: 'Yes, for this session' },
  { value: 'remember', label: 'Yes, and remember this directory', detail: 'saved in .claude/settings.local.json' },
  { value: 'no', label: 'No' },
]

function normalizeForCompare(p: string): string {
  const unified = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(unified) ? unified.toLowerCase() : unified
}

function isInside(child: string, parent: string): boolean {
  const c = normalizeForCompare(child)
  const p = normalizeForCompare(parent)
  return c === p || c.startsWith(`${p}/`)
}

async function startAddDirectory(arg: string) {
  activePanel.value = null
  const session = runtime?.sessionStore.activeSession()
  const conn = await connection()
  if (!session || !conn) return
  const result = await conn.resolveDirectory(arg || undefined)
  if (result.cancelled) {
    closePanel()
    return
  }
  if (result.error || !result.path) {
    notify(result.error ?? 'Not a directory', 'error')
    closePanel()
    return
  }
  const dir = result.path
  const cwd = session.cwd()
  const { entries } = await conn.getPermissions()
  const known = [
    ...session.additionalDirectories(),
    ...entries.filter((e) => e.list === 'additionalDirectories').map((e) => e.value),
  ]
  const covering = [cwd, ...known].find((p) => p && isInside(dir, p))
  if (covering) {
    notify(`${dir} is already accessible within ${covering}`, 'warning')
    closePanel()
    return
  }
  addDirPath.value = dir
  activePanel.value = 'add-dir'
}

async function confirmAddDirectory(choice: string) {
  const dir = addDirPath.value
  const session = runtime?.sessionStore.activeSession()
  if (choice === 'no' || !dir || !session) return
  if (session.busy()) {
    notify('Wait for the current turn to finish, then add the directory again', 'warning')
    return
  }
  try {
    if (choice === 'remember') {
      const error = await (await connection())?.updatePermission('additionalDirectories', 'add', dir, 'local-settings')
      if (error) {
        notify(error, 'error')
        return
      }
      await session.relaunch()
      notify(`Added ${dir}, saved in the local settings`)
    } else {
      await session.addDirectoryForSession(dir)
      notify(`Added ${dir} for this session`)
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), 'error')
  }
}

async function openReleaseNotes() {
  const error = await (await connection())?.openReleaseNotes()
  if (error) notify(error, 'error')
}

// `/help` → a command: open its panel, or put it in the input to add arguments
function pickFromHelp(command: string) {
  activePanel.value = null
  if (openPickerFor(command)) return
  content.value = `${command} `
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.textContent = content.value
      textareaRef.value.focus()
      placeCaretAtEnd(textareaRef.value)
    }
    emit('input', content.value)
    autoResizeTextarea()
  })
}

function openSettingsFile() {
  void runtime?.sessionStore.activeSession()?.openConfigFile('settings')
  closePanel()
}

// ---- Prompt history (↑/↓, Ctrl+R), shared with the CLI ----

const promptHistory = usePromptHistory(
  async () => runtime?.connectionManager.get(),
  () => getWorkspaceRoot()
)
/** Entry shown while browsing with ↑/↓ (-1 = the draft being typed) */
const historyIndex = ref(-1)
let historyDraft = ''

const historyItems = computed<ListPanelItem[]>(() =>
  promptHistory.entries.value.map((entry, i) => ({
    value: String(i),
    label: oneLine(entry.display),
    detail: relativeTime(entry.timestamp),
  }))
)

function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Replace the input text (caret at the end), without the completion menus */
function setInputText(text: string) {
  content.value = text
  if (textareaRef.value) {
    textareaRef.value.textContent = text
    textareaRef.value.focus()
    placeCaretAtEnd(textareaRef.value)
  }
  emit('input', text)
  autoResizeTextarea()
}

/** Text offset of the caret in the input, or null when it is not in there */
function caretOffset(): number | null {
  const el = textareaRef.value
  const sel = window.getSelection()
  if (!el || !sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.endContainer)) return null
  const before = range.cloneRange()
  before.selectNodeContents(el)
  before.setEnd(range.endContainer, range.endOffset)
  return before.toString().length
}

/**
 * Caret on the first (or last) visual line: only then do ↑/↓ leave the text
 * for the history, so moving inside a multi-line prompt keeps working.
 */
function caretOnEdgeLine(edge: 'first' | 'last'): boolean {
  const el = textareaRef.value
  if (!el) return false
  if (!content.value) return true
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed) return false
  const offset = caretOffset()
  if (offset === null) return false
  const all = document.createRange()
  all.selectNodeContents(el)
  const lines = all.getClientRects()
  const caret = getCaretClientRect(el)
  if (!caret || !lines.length || (caret.top === 0 && caret.bottom === 0)) {
    return edge === 'first' ? offset === 0 : offset >= content.value.length
  }
  const half = (parseFloat(getComputedStyle(el).lineHeight) || 22) / 2
  return edge === 'first'
    ? caret.top < lines[0].top + half
    : caret.bottom > lines[lines.length - 1].bottom - half
}

/** ↑ (older) / ↓ (newer) through the history; false = the key moves the caret instead */
function navigateHistory(older: boolean): boolean {
  const entries = promptHistory.entries.value
  if (older) {
    if (!caretOnEdgeLine('first')) return false
    const next = historyIndex.value + 1
    // At the oldest entry the key is still taken, so the caret does not jump
    if (next >= entries.length) return historyIndex.value >= 0
    if (historyIndex.value === -1) historyDraft = content.value
    historyIndex.value = next
    setInputText(entries[next].display)
    return true
  }
  if (historyIndex.value < 0 || !caretOnEdgeLine('last')) return false
  historyIndex.value -= 1
  setInputText(historyIndex.value < 0 ? historyDraft : entries[historyIndex.value].display)
  return true
}

function openHistorySearch() {
  panelArg.value = content.value.trim()
  activePanel.value = 'history-search'
  void promptHistory.refresh(true)
}

function useHistoryEntry(value: string) {
  const entry = promptHistory.entries.value[Number(value)]
  if (!entry) return
  historyIndex.value = -1
  // After the panel closed and the input is shown again
  setTimeout(() => setInputText(entry.display), 0)
}

// ---- Rewind (Esc Esc) ----

let lastEscapeAt = 0
const DOUBLE_ESCAPE_MS = 600

/** Messages Rewind can go back to, newest first (fixed while the panel is open) */
const rewindTargets = shallowRef<Message[]>([])
/** Message to open Rewind on directly ("Restore checkpoint" on that message) */
const rewindInitial = shallowRef<Message | undefined>(undefined)

/** Text the user typed in a message (no attachments, selections or injected context) */
function messageText(message: Message): string {
  const content = message.message.content
  if (typeof content === 'string') return content
  return content
    .map((wrapper) => wrapper.content)
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** As in the CLI, the rewound message comes back in the input to edit and resend */
function restoreRewoundText(text: string) {
  // After the panel closed and the input is shown again
  setTimeout(() => setInputText(text), 0)
}

function openRewind(target?: Message) {
  const session = runtime?.sessionStore.activeSession()
  if (!session) return
  rewindInitial.value = target
  if (session.busy()) {
    notify('Wait for the current turn to finish', 'warning')
    return
  }
  rewindTargets.value = session
    .messages()
    .filter((m) => m.type === 'user' && !!m.uuid && !!messageText(m))
    .reverse()
  activePanel.value = 'rewind'
}

/** Esc Esc while idle: clear the input, or open rewind when it is empty (the CLI's keys) */
function handleEscape(event: KeyboardEvent): boolean {
  // Esc then stops the turn or the bash command (ChatPage); it must not start a double press
  const shellRunning = runtime?.sessionStore.activeSession()?.shellRunning() ?? false
  if (props.conversationWorking || shellRunning || event.repeat) {
    lastEscapeAt = 0
    return false
  }
  const now = Date.now()
  if (now - lastEscapeAt > DOUBLE_ESCAPE_MS) {
    lastEscapeAt = now
    return false
  }
  lastEscapeAt = 0
  if (content.value.trim()) {
    clearInput()
    historyIndex.value = -1
  } else {
    openRewind()
  }
  return true
}

function closePanel() {
  activePanel.value = null
  nextTick(() => textareaRef.value?.focus())
}

function clearInput() {
  content.value = ''
  if (textareaRef.value) {
    textareaRef.value.textContent = ''
  }
  emit('input', '')
  nextTick(() => autoResizeTextarea())
}

/** `!command`: the input runs a shell command (the CLI's bash mode) */
const bashMode = computed(() => content.value.trimStart().startsWith('!'))

const isSubmitDisabled = computed(() => {
  return !content.value.trim() || isLoading.value
})

// === Using the new Completion Dropdown composable ===

/** The slash command being picked was chosen with Tab (complete only, never run) */
let slashPickedWithTab = false

// Slash command completion
const slashCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '/',
  provider: (query, signal) => getSlashCommands(query, runtime, signal),
  toDropdownItem: commandToDropdownItem,
  onSelect: (command, query) => {
    if (openPickerFor(command.label)) {
      return
    }
    if (query) {
      // Replace the text
      const updated = slashCompletion.replaceText(content.value, `${command.label} `)

      // Picked with Enter or a click, alone in the input and taking no
      // arguments (no argument hint): run it, like the CLI. Tab only
      // completes; a command with arguments goes into the input to finish.
      if (!slashPickedWithTab && !command.argumentHint && updated.trim() === command.label) {
        content.value = command.label
        if (textareaRef.value) textareaRef.value.textContent = command.label
        // After the dropdown has closed (it closes right after onSelect)
        void nextTick(handleSubmit)
        return
      }
      content.value = updated

      // Update the DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated
        placeCaretAtEnd(textareaRef.value)
      }

      // Fire the input event
      emit('input', updated)
    }
  },
  anchorElement: textareaRef
})

// @ file reference completion
const fileCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '@',
  provider: (query, signal) => getFileReferences(query, runtime, signal),
  toDropdownItem: fileToDropdownItem,
  onSelect: (file, query) => {
    if (query) {
      // Replace the text, inserting the file path
      const updated = fileCompletion.replaceText(content.value, `@${file.path} `)
      content.value = updated

      // Update the DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated
        placeCaretAtEnd(textareaRef.value)
      }

      // Fire the input event
      emit('input', updated)
    }
  },
  anchorElement: textareaRef
})

// Move the caret to the end
function placeCaretAtEnd(node: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// Get the client rect of the caret
function getCaretClientRect(editable: HTMLElement | null): DOMRect | undefined {
  if (!editable) return undefined

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return undefined

  const range = sel.getRangeAt(0).cloneRange()
  if (!editable.contains(range.startContainer)) return undefined

  // A collapsed range usually has 0 width but a line height; prefer getClientRects
  const rects = range.getClientRects()
  const rect = rects[0] || range.getBoundingClientRect()
  if (!rect) return undefined

  // Fallback line height, so a 0 height does not break the Dropdown's internal math
  const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16
  const height = rect.height || lh

  return new DOMRect(rect.left, rect.top, rect.width, height)
}

// Get a rect from a character offset (used to anchor at the start of the trigger word)
function getRectAtCharOffset(editable: HTMLElement, charOffset: number): DOMRect | undefined {
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let remaining = charOffset
  let node: Text | null = null

  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) {
      const range = document.createRange()
      range.setStart(node, Math.max(0, remaining))
      range.collapse(true)
      const rects = range.getClientRects()
      const rect = rects[0] || range.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16
      const height = rect.height || lh
      return new DOMRect(rect.left, rect.top, rect.width, height)
    }
    remaining -= len
  }

  return undefined
}

// Update the dropdown position
function updateDropdownPosition(
  completion: typeof slashCompletion | typeof fileCompletion,
  anchor: 'caret' | 'queryStart' = 'queryStart'
) {
  const el = textareaRef.value
  if (!el) return

  let rect: DOMRect | undefined

  // Prefer anchoring at the start of the trigger word
  if (anchor === 'queryStart' && completion.triggerQuery.value) {
    rect = getRectAtCharOffset(el, completion.triggerQuery.value.start)
  }

  // Fallback: anchor at the caret
  if (!rect && anchor === 'caret') {
    rect = getCaretClientRect(el)
  }

  // Vertical anchor = top edge of the whole input box, so the (above-placed)
  // dropdown never covers the text being typed. A collapsed range can yield an
  // empty/stale rect, so the character rect is only used for the left edge.
  const box = (el.closest('.full-input-box') as HTMLElement | null)?.getBoundingClientRect()
    ?? el.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const left = rect && rect.left > 0 ? rect.left : elRect.left

  completion.updatePosition({
    top: box.top,
    left,
    width: rect?.width ?? 0,
    height: 0
  })
}

function handleInput(event: Event) {
  const target = event.target as HTMLDivElement
  const textContent = target.textContent || ''

  // Only clean the div when it is completely empty
  if (textContent.length === 0) {
    target.innerHTML = ''
  }

  content.value = textContent
  emit('input', textContent)
  historyIndex.value = -1

  // Evaluate completions (slash and @)
  slashCompletion.evaluateQuery(textContent)
  fileCompletion.evaluateQuery(textContent)

  // Update the dropdown position (anchored at the start of the trigger word)
  if (slashCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(slashCompletion, 'queryStart')
    })
  }
  if (fileCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(fileCompletion, 'queryStart')
    })
  }

  // Auto height
  autoResizeTextarea()
}

function autoResizeTextarea() {
  if (!textareaRef.value) return

  nextTick(() => {
    const divElement = textareaRef.value!

    // Reset the height to get an accurate scrollHeight
    divElement.style.height = INPUT_MIN_HEIGHT + 'px'

    // Compute the required height
    const scrollHeight = divElement.scrollHeight
    const minHeight = INPUT_MIN_HEIGHT
    const maxHeight = INPUT_MAX_HEIGHT

    if (scrollHeight <= maxHeight) {
      // Content fits within the max height: adjust height and hide the scrollbar
      divElement.style.height = Math.max(scrollHeight, minHeight) + 'px'
      divElement.style.overflowY = 'hidden'
    } else {
      // Content exceeds the max height: use the max height and show the scrollbar
      divElement.style.height = maxHeight + 'px'
      divElement.style.overflowY = 'auto'
    }
  })
}

function handleKeydown(event: KeyboardEvent) {
  // Handle completion menu keyboard events first
  if (slashCompletion.isOpen.value) {
    slashPickedWithTab = event.key === 'Tab'
    slashCompletion.handleKeydown(event)
    slashPickedWithTab = false
    return
  }

  // Handle file reference completion keyboard events
  if (fileCompletion.isOpen.value) {
    fileCompletion.handleKeydown(event)
    return
  }

  if (event.isComposing) return
  const plainCtrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
  const noModifier = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey

  // Ctrl+C clears the input like the CLI; with text selected it still copies
  if (plainCtrl && event.key.toLowerCase() === 'c') {
    const sel = window.getSelection()
    if ((!sel || sel.isCollapsed) && content.value) {
      event.preventDefault()
      clearInput()
      historyIndex.value = -1
    }
    return
  }

  // Ctrl+R: search the prompt history (VS Code's Open Recent stays outside the chat)
  if (plainCtrl && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    openHistorySearch()
    return
  }

  if (noModifier && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    // As in the CLI: ↑ first takes the queued prompts out of the queue for
    // editing (they are sent again only when submitted), then the history
    if (
      event.key === 'ArrowUp' &&
      props.hasQueued &&
      historyIndex.value === -1 &&
      caretOnEdgeLine('first')
    ) {
      event.preventDefault()
      emit('editQueued')
      return
    }
    // ↓ on the last line, not browsing the history: into the task list below
    if (
      event.key === 'ArrowDown' &&
      props.hasTasksBelow &&
      historyIndex.value === -1 &&
      caretOnEdgeLine('last')
    ) {
      event.preventDefault()
      emit('focusTasks')
      return
    }
    if (navigateHistory(event.key === 'ArrowUp')) {
      event.preventDefault()
    }
    return
  }

  if (event.key === 'Escape' && noModifier) {
    if (handleEscape(event)) {
      event.preventDefault()
    }
    return
  }

  // Other keys
  if (event.key === 'Enter' && !event.shiftKey) {
    // Check whether an IME composition is in progress (e.g. Chinese input methods)
    if (event.isComposing) {
      return
    }
    event.preventDefault()
    handleSubmit()
  }

  // Check for empty content later (after the key is handled)
  if (event.key === 'Backspace' || event.key === 'Delete') {
    setTimeout(() => {
      const target = event.target as HTMLDivElement
      const textContent = target.textContent || ''
      if (textContent.length === 0) {
        target.innerHTML = ''
        content.value = ''
      }
    }, 0)
  }
}

function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) {
    return
  }

  const items = clipboard.items
  if (!items || items.length === 0) {
    return
  }

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }

  if (files.length > 0) {
    event.preventDefault()
    // Create a FileList-like object
    const dataTransfer = new DataTransfer()
    for (const file of files) {
      dataTransfer.items.add(file)
    }
    // Trigger adding the attachments
    handleAddFiles(dataTransfer.files)
  }
}

function getWorkspaceRoot(): string | undefined {
  const r = runtime as any
  if (!r) return undefined

  try {
    const sessionStore = r.sessionStore
    const activeSession = sessionStore?.activeSession?.()
    const cwdFromSession = activeSession?.cwd?.()
    if (typeof cwdFromSession === 'string' && cwdFromSession) {
      return cwdFromSession
    }
  } catch {
    // ignore
  }

  try {
    const connection = r.connectionManager?.connection?.()
    const config = connection?.config?.()
    if (config?.defaultCwd && typeof config.defaultCwd === 'string') {
      return config.defaultCwd
    }
  } catch {
    // ignore
  }

  return undefined
}

function toWorkspaceRelativePath(absoluteOrMixedPath: string): string {
  const root = getWorkspaceRoot()
  if (!root) return absoluteOrMixedPath

  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  let normPath = absoluteOrMixedPath.replace(/\\/g, '/')

  // Handle paths like /C:/ produced by converting file:// URIs on Windows
  if (normPath.startsWith('/') && /^[A-Za-z]:\//.test(normPath.slice(1))) {
    normPath = normPath.slice(1)
  }

  if (normPath === normRoot) {
    return ''
  }

  if (normPath.startsWith(normRoot + '/')) {
    return normPath.slice(normRoot.length + 1)
  }

  return absoluteOrMixedPath
}

function isFileDrop(event: DragEvent): boolean {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return false

  const types = Array.from(dataTransfer.types || [])
  if (types.includes('Files')) return true
  if (types.includes('text/uri-list')) return true

  return false
}

function extractFilePathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const paths: string[] = []

  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    const lines = uriList
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    for (const line of lines) {
      try {
        const url = new URL(line)
        if (url.protocol === 'file:') {
          const decodedPath = decodeURIComponent(url.pathname)
          paths.push(toWorkspaceRelativePath(decodedPath))
        } else {
          paths.push(toWorkspaceRelativePath(line))
        }
      } catch {
        paths.push(toWorkspaceRelativePath(line))
      }
    }
  }

  if (paths.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      const fileWithPath = file as File & { path?: string }
      if (fileWithPath.path) {
        paths.push(toWorkspaceRelativePath(fileWithPath.path))
      } else {
        paths.push(toWorkspaceRelativePath(file.name))
      }
    }
  }

  return paths
}

async function statPaths(
  paths: string[]
): Promise<Record<string, 'file' | 'directory' | 'other' | 'not_found'>> {
  const result: Record<string, 'file' | 'directory' | 'other' | 'not_found'> = {}
  if (!paths.length) return result

  const r = runtime as any
  if (!r) return result

  try {
    const connection = await r.connectionManager.get()
    const response = await connection.statPaths(paths)
    const entries = (response?.entries ?? []) as Array<{ path: string; type: any }>
    for (const entry of entries) {
      if (!entry || typeof entry.path !== 'string') continue
      const t = entry.type
      if (t === 'file' || t === 'directory' || t === 'other' || t === 'not_found') {
        result[entry.path] = t
      }
    }
  } catch (error) {
    console.warn('[ChatInputBox] statPaths failed:', error)
  }

  return result
}

function handleDragOver(event: DragEvent) {
  // Intercept only when Shift is held and a file/URI is dragged, so normal text drags are unaffected
  if (!event.shiftKey) return
  if (!isFileDrop(event)) return

  event.preventDefault()
}

async function handleDrop(event: DragEvent) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  // With Shift held, dragging files from the Explorer means "insert path"
  if (!event.shiftKey) return
  if (!isFileDrop(event)) return

  event.preventDefault()

  const paths = extractFilePathsFromDataTransfer(dataTransfer)
  if (paths.length === 0) return

  const types = await statPaths(paths)

  const mentionText = paths
    .map(p => {
      const t = types[p]
      const isDir = t === 'directory'
      const normalized = isDir && !p.endsWith('/') ? `${p}/` : p
      return `@${normalized}`
    })
    .join(' ')

  const baseContent = content.value.trimEnd()
  const updatedContent = baseContent ? `${baseContent} ${mentionText} ` : `${mentionText} `

  content.value = updatedContent

  if (textareaRef.value) {
    textareaRef.value.textContent = updatedContent
    placeCaretAtEnd(textareaRef.value)
  }

  emit('input', updatedContent)
  autoResizeTextarea()

  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function handleSubmit() {
  const typed = content.value.trim()
  if (!typed) return

  promptHistory.record(typed, runtime?.sessionStore.activeSession()?.sessionId())
  historyIndex.value = -1

  if (bashMode.value) {
    const command = typed.slice(1).trim()
    if (command) {
      emit('bash', command)
      clearInput()
    }
    return
  }

  if (openPickerFor(typed)) {
    return
  }

  if (props.conversationWorking) {
    // Conversation busy: add to the queue
    emit('queueMessage', content.value)
  } else {
    // Conversation idle: send directly
    emit('submit', content.value)
  }

  // Clear the input box
  content.value = ''
  if (textareaRef.value) {
    textareaRef.value.textContent = ''
  }

  // Reset the input height after the DOM updates
  nextTick(() => {
    autoResizeTextarea()
  })
}

function handleStop() {
  emit('stop')
}

function handleMention(filePath?: string) {
  if (!filePath) return

  // Insert @file-path at the caret
  const updatedContent = content.value + `@${filePath} `
  content.value = updatedContent

  // Update the DOM
  if (textareaRef.value) {
    textareaRef.value.textContent = updatedContent
    placeCaretAtEnd(textareaRef.value)
  }

  // Fire the input event
  emit('input', updatedContent)

  // Focus the input box
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function handleAddFiles(files: FileList) {
  emit('addAttachment', files)
}

function isImageAttachment(a: AttachmentItem): boolean {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(a.mediaType)
}

function attachmentSrc(a: AttachmentItem): string {
  return `data:${a.mediaType};base64,${a.data}`
}

/** Attachment shown in the full-size popup */
const preview = ref<AttachmentItem | null>(null)

function openPreview(a: AttachmentItem) {
  preview.value = a
}

function handleRemoveAttachment(id: string) {
  if (preview.value?.id === id) preview.value = null
  emit('removeAttachment', id)
}

// Watch caret position changes (only reposition while the dropdown is open, to avoid duplicate requests)
function handleSelectionChange() {
  if (!content.value || !textareaRef.value) return

  // Only reposition while the dropdown is open
  // Avoid calling evaluateQuery again (already called in handleInput)
  if (slashCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(slashCompletion, 'queryStart')
    })
  }
  if (fileCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(fileCompletion, 'queryStart')
    })
  }
}

// ---- keep the caret in the chat input ------------------------------------
// The host only focuses the iframe (tab switch, view focus); without this the
// user had to click the input again every time they came back to the chat.

/** Focus the input with the caret at the end (a bare focus() on a
 *  contenteditable puts it at the start) */
function focusInputAtEnd() {
  const el = textareaRef.value
  if (!el || activePanel.value) return
  el.focus()
  const sel = window.getSelection()
  if (!sel || el.contains(sel.anchorNode)) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** A permission / question / plan prompt is waiting: it owns the keyboard */
function promptOpen() {
  return !!document.querySelector('[data-permission-panel]')
}

function onWindowFocus() {
  // Let the browser restore the previously focused element first
  setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body && active !== document.documentElement) return
    if (promptOpen()) {
      document.querySelector<HTMLElement>('[data-permission-panel] [tabindex="0"]')?.focus()
      return
    }
    focusInputAtEnd()
  }, 0)
}

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [tabindex], [role="button"], [role="option"], [role="dialog"], label, summary'

function onDocumentMouseUp(event: MouseEvent) {
  if (event.button !== 0 || promptOpen()) return
  const target = event.target as Element | null
  if (!target || target.closest(INTERACTIVE)) return
  // Selecting text in a message must keep the selection
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed && sel.toString().length > 0) return
  focusInputAtEnd()
}

// Add/remove the selectionchange listener
onMounted(() => {
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('mouseup', onDocumentMouseUp)
  document.addEventListener('selectionchange', handleSelectionChange)
  textareaRef.value?.addEventListener('focus', refreshHistory)
  void promptHistory.refresh(true)
})

function refreshHistory() {
  void promptHistory.refresh()
}

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('mouseup', onDocumentMouseUp)
  document.removeEventListener('selectionchange', handleSelectionChange)
  textareaRef.value?.removeEventListener('focus', refreshHistory)
})

// Exposed methods: let the parent set content and focus
defineExpose({
  /** Open Rewind; with a message, straight on its "what to restore" step */
  openRewind(target?: Message) {
    openRewind(target)
  },
  /** Current text of the input */
  getContent(): string {
    return content.value
  },
  /** Set the input content and sync internal state */
  setContent(text: string) {
    content.value = text || ''
    const el = textareaRef.value
    if (el) {
      el.textContent = content.value
      // Replacing the text drops the caret to the start; text put back into
      // the input (Esc, queue edit, cold resume) is continued at its end
      if (document.activeElement === el) placeCaretAtEnd(el)
    }
    autoResizeTextarea()
  },
  /** Focus the input box */
  focus() {
    nextTick(() => focusInputAtEnd())
  }
})

</script>

<style scoped>
/* Base input styles - fixed line height for stable caret positioning */
.aislash-editor-input {
  line-height: 22px;
  max-height: 360px;
  resize: none;
  overflow-y: hidden;
  word-wrap: break-word;
  white-space: pre-wrap;
  width: 100%;
}

/* Remove the border when the input is focused */
.aislash-editor-input:focus {
  outline: none !important;
  border: none !important;
}

/* Cursor keeps the same border while focused */
.full-input-box:focus-within {
  border-color: var(--cs-fg-20) !important;
  outline: none !important;
}

/* Bash mode (`!command`): the frame takes the CLI's bash color */
.full-input-box.bash-mode,
.full-input-box.bash-mode:focus-within {
  border-color: var(--vscode-terminal-ansiMagenta, #d670d6) !important;
}

/* Placeholder styles */
.aislash-editor-input:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
  position: absolute;
}

.aislash-editor-input:focus:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
}

/* Attachment list styles - horizontally arranged pills */
.attachments-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  min-height: 20px;
  /* max-height: 44px; */
  overflow: hidden;
}

.attachment-item {
  display: inline-flex;
  align-items: center;
  padding-right: 4px;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  font-size: 12px;
  flex-shrink: 0;
  max-width: 200px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  outline: none;
  line-height: 16px;
  height: 20px;
}

.attachment-item:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* Overlapping container for the icon and close button */
.icon-wrapper {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.attachment-icon {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  opacity: 1;
  transition: opacity 0.15s ease;
  scale: 0.8;
}

/* Make sure icon styles apply (use :deep to reach inside FileIcon) */
.attachment-item .attachment-icon :deep(.mdi),
.attachment-item .attachment-icon :deep(.codicon) {
  color: var(--vscode-foreground);
  opacity: 0.8;
}

.attachment-name {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-foreground);
  opacity: 1;
  max-width: 140px;
}

.attachment-size {
  display: none; /* hide the file size to keep it clean */
}

.remove-button {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.remove-button .codicon {
  font-size: 14px;
}

/* Swap the icon and button visibility on attachment-item hover */
.attachment-item:hover .attachment-icon {
  opacity: 0;
}

.attachment-item:hover .remove-button {
  opacity: 0.8;
}

.remove-button:hover {
  opacity: 1 !important;
}

/* Image attachment: thumbnail with an always-visible remove button */
.attachment-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  overflow: hidden;
  cursor: zoom-in;
  background: var(--vscode-editor-background);
}

.attachment-thumb:hover {
  border-color: var(--vscode-focusBorder);
}

.attachment-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
}

.thumb-remove:hover {
  background: rgba(0, 0, 0, 0.85);
}

.thumb-remove .codicon {
  font-size: 12px;
}

</style>
