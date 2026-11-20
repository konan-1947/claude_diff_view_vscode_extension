<template>
  <div class="chat-page">
    <!-- Top bar: one chat tab on the left, session actions on the right (Cursor's tab strip) -->
    <div class="chat-header">
      <div class="chat-tab" :title="title">
        <span class="codicon codicon-comment chat-tab-icon"></span>
        <span class="chat-title">{{ title }}</span>
      </div>
      <div class="header-right">
        <button class="header-btn" title="New conversation" @click="createNew">
          <span class="codicon codicon-add"></span>
        </button>
        <button class="header-btn" title="Show chat history" @click="$emit('switchToSessions')">
          <span class="codicon codicon-history"></span>
        </button>
      </div>
    </div>

    <!-- Body: message container -->
    <div class="main" :class="{ 'is-empty': messages.length === 0 }">
      <!-- <div class="chatContainer"> -->
        <div
          ref="containerEl"
          :class="['messagesContainer', 'custom-scroll-container', { dimmed: permissionRequestsLen > 0 }]"
        >
          <template v-if="messages.length === 0" />
          <template v-else>
            <!-- <div class="msg-list"> -->
              <template v-for="item in chatItems" :key="item.key">
                <TurnView
                  v-if="item.kind === 'turn'"
                  :turn="item"
                  :context="toolContext"
                  :default-open="item.key === liveTurnKey"
                  :running="isBusy && item.key === lastTurnKey"
                />
                <MessageRenderer
                  v-else
                  :message="item.message"
                  :context="toolContext"
                />
              </template>
            <!-- </div> -->
            <div v-if="isBusy" class="spinnerRow">
              <Spinner :size="16" :permission-mode="permissionMode" />
            </div>
            <div ref="endEl" />
          </template>
        </div>

        <div class="inputContainer">
          <PermissionRequestModal
            v-if="pendingPermission && toolContext"
            :request="pendingPermission"
            :context="toolContext"
            :on-resolve="handleResolvePermission"
            data-permission-panel="1"
          />
          <ChatInputBox
            :show-progress="true"
            :progress-percentage="progressPercentage"
            :context-tooltip="contextTooltip"
            :conversation-working="isBusy"
            :attachments="attachments"
            :thinking-level="session?.thinkingLevel.value"
            :permission-mode="session?.permissionMode.value"
            :selected-model="session?.modelSelection.value"
            :modes="modes"
            :show-thinking-toggle="showThinkingToggle"
            :effort-level="session?.effortLevel.value"
            :effort-levels="effortLevels"
            @submit="handleSubmit"
            @stop="handleStop"
            @add-attachment="handleAddAttachment"
            @remove-attachment="handleRemoveAttachment"
            @thinking-toggle="handleToggleThinking"
            @effort-select="handleEffortSelect"
            @mode-select="handleModeSelect"
            @model-select="handleModelSelect"
          />
        </div>
      <!-- </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue';
  import { RuntimeKey } from '../composables/runtimeContext';
  import { useSession } from '../composables/useSession';
  import type { Session } from '../core/Session';
  import type { PermissionRequest } from '../core/PermissionRequest';
  import type { ToolContext } from '../types/tool';
  import type { AttachmentItem } from '../types/attachment';
  import { convertFileToAttachment } from '../types/attachment';
  import ChatInputBox from '../components/ChatInputBox.vue';
  import PermissionRequestModal from '../components/PermissionRequestModal.vue';
  import Spinner from '../components/Messages/WaitingIndicator.vue';
  import MessageRenderer from '../components/Messages/MessageRenderer.vue';
  import TurnView from '../components/Messages/TurnView.vue';
  import { buildChatItems } from '../utils/turns';
  import { useKeybinding } from '../utils/useKeybinding';
  import { useSignal } from '@gn8/alien-signals-vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
  import { useModelCatalog } from '../composables/useModelCatalog';
  import { availableModes, nextMode } from '../utils/permissionModes';

  const runtime = inject(RuntimeKey);
  if (!runtime) throw new Error('[ChatPage] runtime not provided');

  const toolContext = computed<ToolContext>(() => ({
    fileOpener: {
      open: (filePath: string, location?: any) => {
        void runtime.appContext.fileOpener.open(filePath, location);
      },
      openContent: (content: string, fileName: string, editable: boolean) => {
        return runtime.appContext.fileOpener.openContent(
          content,
          fileName,
          editable
        );
      },
    },
  }));

  // Subscribe to activeSession (alien-signal → Vue ref)
  const activeSessionRaw = useSignal<Session | undefined>(
    runtime.sessionStore.activeSession
  );

  // Convert alien-signals to Vue Refs with useSession
  const session = computed(() => {
    const raw = activeSessionRaw.value;
    return raw ? useSession(raw) : null;
  });

  // All access now goes through Vue Refs (.value)
  const title = computed(() => session.value?.summary.value || 'New Conversation');
  const messages = computed<any[]>(() => session.value?.messages.value ?? []);
  const isBusy = computed(() => session.value?.busy.value ?? false);

  // Turns shown the way Cursor does: one user message + everything the assistant did
  const chatItems = computed(() => buildChatItems(messages.value));
  const lastTurnKey = computed(() => {
    for (let i = chatItems.value.length - 1; i >= 0; i--) {
      if (chatItems.value[i].kind === 'turn') return chatItems.value[i].key;
    }
    return -1;
  });
  // The turn worked on while this page was open keeps its steps unfolded (Cursor
  // does the same); turns loaded from history start folded under "Worked for Ns".
  const liveTurnKey = ref(-1);
  watch(isBusy, (busy) => {
    if (busy) liveTurnKey.value = lastTurnKey.value;
  });
  const permissionMode = computed(
    () => session.value?.permissionMode.value ?? 'default'
  );
  const permissionRequests = computed(
    () => session.value?.permissionRequests.value ?? []
  );
  const permissionRequestsLen = computed(() => permissionRequests.value.length);
  const pendingPermission = computed(() => permissionRequests.value[0] as any);

  // Capabilities of the selected model, as the CLI reports them. Everything
  // below follows these flags, so a CLI update needs no change here.
  const { findModelInfo } = useModelCatalog();
  const modelInfo = computed(() => findModelInfo(session.value?.modelSelection.value));
  const effortLevels = computed<string[]>(() => {
    const info = modelInfo.value;
    if (!info || info.supportsEffort === false) return [];
    return Array.isArray(info.supportedEffortLevels) ? info.supportedEffortLevels : [];
  });
  // Unknown (custom model, older CLI): keep the toggle; hide it only when the
  // CLI says thinking cannot be turned off.
  const showThinkingToggle = computed(() => modelInfo.value?.supportsThinkingOff !== false);
  const modes = computed(() =>
    availableModes({
      supportsAutoMode: modelInfo.value?.supportsAutoMode === true,
      allowBypassPermissions: session.value?.config.value?.allowBypassPermissions === true,
      current: permissionMode.value,
    })
  );
  const platform = computed(() => runtime.appContext.platform);

  // Register the command permissionMode.toggle (registered after the function is defined below)

  // Estimate the token usage ratio (from usageData)
  const usageComputed = computed(() => {
    const s = session.value;
    if (!s) return { percentage: 0, totalTokens: 0, contextWindow: 200000 };

    const usage = s.usageData.value;
    const total = usage.totalTokens;
    const windowSize = usage.contextWindow || 200000;
    const percentage = (typeof total === 'number' && total > 0)
      ? Math.max(0, Math.min(100, (total / windowSize) * 100))
      : 0;

    return { percentage, totalTokens: total, contextWindow: windowSize };
  });

  const progressPercentage = computed(() => usageComputed.value.percentage);

  const contextTooltip = computed(() => {
    const { totalTokens, contextWindow } = usageComputed.value;
    const fmt = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return `${n}`;
    };
    return `${fmt(totalTokens)} / ${fmt(contextWindow)} context used`;
  });

  // DOM refs
  const containerEl = ref<HTMLDivElement | null>(null);
  const endEl = ref<HTMLDivElement | null>(null);

  // Attachment state
  const attachments = ref<AttachmentItem[]>([]);

  // Remember the last message count, to decide whether to scroll
  let prevCount = 0;

  function stringify(m: any): string {
    try {
      return JSON.stringify(m ?? {}, null, 2);
    } catch {
      return String(m);
    }
  }

  function scrollToBottom(): void {
    const end = endEl.value;
    if (!end) return;
    requestAnimationFrame(() => {
      try {
        end.scrollIntoView({ block: 'end' });
      } catch {}
    });
  }

  watch(session, async () => {
    // Session switch: reset and scroll to the bottom
    prevCount = 0;
    await nextTick();
    scrollToBottom();
  });

  // moved above

  watch(
    () => messages.value.length,
    async len => {
      const increased = len > prevCount;
      prevCount = len;
      if (increased) {
        await nextTick();
        scrollToBottom();
      }
    }
  );

  watch(permissionRequestsLen, async () => {
    // Also scroll to the bottom when a permission request appears
    await nextTick();
    scrollToBottom();
  });

  onMounted(async () => {
    prevCount = messages.value.length;
    await nextTick();
    scrollToBottom();
  });

  onUnmounted(() => {
    try { unregisterToggle?.(); } catch {}
  });

  async function createNew(): Promise<void> {
    if (!runtime) return;

    // 1. First try creating a new tab through appContext.startNewConversationTab (multi-tab mode)
    if (runtime.appContext.startNewConversationTab()) {
      return;
    }

    // 2. Not in multi-tab mode: check whether the current session is empty
    const currentMessages = messages.value;
    if (currentMessages.length === 0) {
      // The current session is already empty, no need to create a new one
      return;
    }

    // 3. The current session has content: create a new session
    await runtime.sessionStore.createSession({ isExplicit: true });
  }

  // ChatInput event handling
  async function handleSubmit(content: string) {
    const s = session.value;
    const trimmed = (content || '').trim();
    if (!s || (!trimmed && attachments.value.length === 0) || isBusy.value) return;

    try {
      // Pass the attachments to send
      await s.send(trimmed || ' ', attachments.value);

      // Clear the attachments after a successful send
      attachments.value = [];
    } catch (e) {
      console.error('[ChatPage] send failed', e);
    }
  }

  async function handleToggleThinking() {
    const s = session.value;
    if (!s) return;

    const currentLevel = s.thinkingLevel.value;
    const newLevel = currentLevel === 'off' ? 'default_on' : 'off';

    await s.setThinkingLevel(newLevel);
  }

  async function handleEffortSelect(level: string) {
    const s = session.value;
    if (!s) return;

    await s.setEffortLevel(level);
  }

  async function handleModeSelect(mode: PermissionMode) {
    const s = session.value;
    if (!s) return;

    await s.setPermissionMode(mode);
  }

  // permissionMode.toggle: cycle through the modes on offer, in the CLI's order
  const togglePermissionMode = () => {
    const s = session.value;
    if (!s) return;
    const cur = (s.permissionMode.value as string) ?? 'default';
    void s.setPermissionMode(nextMode(modes.value, cur) as PermissionMode);
  };

  // Register the command now (toggle is defined)
  const unregisterToggle = runtime.appContext.commandRegistry.registerAction(
    {
      id: 'permissionMode.toggle',
      label: 'Toggle Permission Mode',
      description: 'Cycle through the available permission modes'
    },
    'App Shortcuts',
    () => {
      togglePermissionMode();
    }
  );

  // Register the shortcut shift+tab → permissionMode.toggle (also active in the input area)
  useKeybinding({
    keys: 'shift+tab',
    handler: togglePermissionMode,
    allowInEditable: true,
    priority: 100,
  });

  // Esc stops the running turn, as in Claude Code. Not while a permission
  // prompt or a dropdown (completion, pickers) is open: Esc closes those.
  useKeybinding({
    keys: 'escape',
    handler: handleStop,
    allowInEditable: true,
    priority: 50,
    when: () =>
      isBusy.value &&
      !pendingPermission.value &&
      !document.querySelector('.dropdown-popover'),
  });

  async function handleModelSelect(modelId: string) {
    const s = session.value;
    if (!s) return;

    await s.setModel({ value: modelId });
  }

  function handleStop() {
    const s = session.value;
    if (s) {
      // Methods are already bound in useSession and can be called directly
      void s.interrupt();
    }
  }

  async function handleAddAttachment(files: FileList) {
    if (!files || files.length === 0) return;

    try {
      // Convert all files to AttachmentItem
      const conversions = await Promise.all(
        Array.from(files).map(convertFileToAttachment)
      );

      // Add to the attachment list
      attachments.value = [...attachments.value, ...conversions];

      console.log('[ChatPage] Added attachments:', conversions.map(a => a.fileName));
    } catch (e) {
      console.error('[ChatPage] Failed to convert files:', e);
    }
  }

  function handleRemoveAttachment(id: string) {
    attachments.value = attachments.value.filter(a => a.id !== id);
  }

  // Permission modal handler
  function handleResolvePermission(request: PermissionRequest, allow: boolean) {
    try {
      if (allow) {
        request.accept(request.inputs);
      } else {
        request.reject('User denied', true);
      }
    } catch (e) {
      console.error('[ChatPage] permission resolve failed', e);
    }
  }
</script>

<style scoped>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Cursor tab strip: 35px, active tab = editor background, hairline below */
  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    height: 35px;
    flex-shrink: 0;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--cs-fg-12));
  }

  .chat-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 200px;
    padding: 0 10px;
    font-size: 13px;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    /* tab sits on top of the hairline */
    margin-bottom: -1px;
    border-right: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--cs-fg-12));
  }

  .chat-tab-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .chat-title {
    margin: 0;
    font-size: 13px;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--cs-fg-66);
    cursor: pointer;
    transition: background-color var(--cs-duration) ease;
  }

  .header-btn .codicon {
    font-size: 16px;
  }

  .header-btn:hover {
    background: var(--cs-fg-8);
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* Chat container and message scroll container (matches React) */
  .chatContainer {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .messagesContainer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--cs-row-gap);
    padding: 10px 0 12px;
    position: relative;
  }
  .spinnerRow {
    padding: 0 calc(var(--cs-edge) + var(--cs-row-inset));
  }
  .messagesContainer.dimmed {
    filter: blur(1px);
    opacity: 0.5;
    pointer-events: none;
  }

  .msg-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 12px;
  }

  .msg-item {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 8px;
  }

  .json-block {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(
      --app-monospace-font-family,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    );
    font-size: var(--app-monospace-font-size, 12px);
    line-height: 1.5;
    color: var(--vscode-editor-foreground);
  }

  /* Other shared styles */

  /* Input area container */
  .inputContainer {
    padding: 0 var(--cs-edge) 10px;
  }

  /* Empty chat: Cursor puts the input at the top of the pane and leaves the rest blank */
  .main.is-empty > .inputContainer {
    order: -1;
    padding-top: 10px;
  }

  /* Pin the bottom dialog area to the bottom */
  .main > :last-child {
    flex-shrink: 0;
    background-color: var(--vscode-sideBar-background);
    /* border-top: 1px solid var(--vscode-panel-border); */
    max-width: 1200px;
    width: 100%;
    align-self: center;
  }

  /* Empty state styles */
  .emptyState {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px 16px;
  }

  .emptyWordmark {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }
</style>
