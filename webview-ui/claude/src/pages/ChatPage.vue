<template>
  <div class="chat-page">
    <!-- Top bar: session actions only (tabs live in the host terminal tab strip) -->
    <div class="chat-header">
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
    <div
      class="main"
      :class="{ 'is-empty': messages.length === 0 }"
      :style="emptyInputHeight ? { '--empty-input-height': `${emptyInputHeight}px` } : undefined"
    >
      <!-- Empty chat: the space above the centered input, holding the logo at its bottom -->
      <div v-if="messages.length === 0" class="empty-top">
        <OmpLogo v-if="isOmp" :version="cliVersion" />
        <ClaudeCodeLogo v-else :version="cliVersion" />
      </div>
      <!-- Steps folded (Ctrl+O, not the default); over the transcript so nothing moves -->
      <div v-if="!transcriptDetail" class="detail-badge">Steps folded&nbsp;&nbsp;Ctrl+O to show</div>
      <!-- <div class="chatContainer"> -->
        <div
          ref="containerEl"
          :class="['messagesContainer', 'custom-scroll-container', { dimmed: dimTranscript }]"
        >
          <template v-if="messages.length === 0" />
          <template v-else>
            <!-- <div class="msg-list"> -->
              <template v-for="item in chatItems" :key="item.key">
                <TurnView
                  v-if="item.kind === 'turn'"
                  :data-turn-key="item.key"
                  :turn="item"
                  :context="toolContext"
                  :running="isBusy && item.key >= runningFromKey"
                />
                <MessageRenderer
                  v-else
                  :message="item.message"
                  :context="toolContext"
                />
              </template>
            <!-- </div> -->
            <!-- No spinner while a prompt waits for the user: nothing is running then -->
            <div v-if="(isBusy || shellRunning) && !pendingPermission" class="spinnerRow">
              <Spinner
                :size="16"
                :permission-mode="permissionMode"
                :started-at="isBusy ? turnStartedAt : undefined"
                :tokens="isBusy ? activity.turnTokens.value : 0"
                :retry="isBusy ? activity.apiRetry.value : undefined"
              />
            </div>
            <div ref="endEl" />
          </template>
        </div>

        <StickyPrompt
          :turn-key="stickyKey ?? -1"
          :visible="!!stickyText && (stickyScrolling || stickyHovered)"
          :text="stickyText"
          :left="stickyBox.left"
          :width="stickyBox.width"
          :shift="stickyShift"
          @jump="jumpToStickyPrompt"
          @hover="onStickyHover"
        />

        <div ref="inputContainerEl" class="inputContainer">
          <!-- Over the transcript, above the input: showing it never moves a row -->
          <button
            v-if="newBelow && !dimTranscript"
            type="button"
            class="new-below"
            title="Scroll to the latest message"
            @click="followLatest"
          >
            <span class="codicon codicon-arrow-down"></span>
            <span>New messages</span>
          </button>
          <SessionConflictPrompt
            v-if="openConflict && !pendingPermission"
            :summary="openConflict.session.summary()"
            :owner-title="openConflict.owner.title"
            @focus-owner="focusConflictOwner"
            @fork="forkConflict"
            @cancel="cancelConflict"
          />
          <ColdResumePrompt
            v-if="coldResume && !openConflict && !pendingPermission"
            :info="coldResume.info"
            @resume="resumeCold"
            @new-conversation="newConversationCold"
            @dismiss="dismissCold"
          />
          <PermissionRequestModal
            v-if="pendingPermission && toolContext"
            :request="pendingPermission"
            :context="toolContext"
            :modes="modes.map((m) => m.id)"
          />
          <RateLimitBanner :info="activity.rateLimit.value" />
          <MessageQueueList
            :queued-messages="queuedMessages"
            :sent-messages="inFlight"
            :visible="queuedMessages.length + inFlight.length > 0"
            class="queueList"
            @remove="handleQueueRemove"
            @send-now="handleQueueSendNow"
          />
          <ChatInputBox
            v-show="!tasksDialogOpen"
            ref="chatInputRef"
            :show-progress="true"
            :progress-percentage="progressPercentage"
            :context-tooltip="contextTooltip"
            :conversation-working="isBusy"
            :has-queued="queuedMessages.length + inFlight.length > 0"
            :has-tasks-below="hasRunningTasks"
            :attachments="attachments"
            :thinking-level="session?.thinkingLevel.value"
            :permission-mode="session?.permissionMode.value"
            :selected-model="session?.modelSelection.value"
            :modes="modes"
            :show-thinking-toggle="showThinkingToggle"
            :effort-level="session?.effortLevel.value"
            :auto-effort-level="session?.appliedEffort.value"
            :effort-levels="effortLevels"
            @command-panel-open="() => session?.refreshAppliedEffort()"
            @submit="handleSubmit"
            @queue-message="handleQueueMessage"
            @bash="handleBash"
            @run-commands="handleRunCommands"
            @open-history="$emit('switchToSessions')"
            @stop="handleStop"
            @edit-queued="editQueued"
            @focus-tasks="tasksListRef?.focusList()"
            @background="handleBackground"
            @add-attachment="handleAddAttachment"
            @remove-attachment="handleRemoveAttachment"
            @thinking-toggle="handleToggleThinking"
            @effort-select="handleEffortSelect"
            @mode-select="handleModeSelect"
            @model-select="handleModelSelect"
          />
          <!-- Below the input, as in the CLI: ↓ from the input moves into it; the
               input stays pinned above and grows upward when it opens -->
          <BackgroundTasksList
            ref="tasksListRef"
            :tasks="activity.backgroundTasks.value"
            :task-info="activity.tasks.value"
            :stop-task="activity.stopTask"
            :subagent-messages="activity.subagentMessages.value"
            :find-shell="findBackgroundShell"
            :read-task-output="readTaskOutput"
            :permission-mode="permissionMode"
            :busy="isBusy"
            @exit="chatInputRef?.focus()"
            @open-change="(v: boolean) => (tasksDialogOpen = v)"
          />
          <!-- Recent conversations (`claude --continue` for the first): under the
               input, so the centered empty-state input does not move when they
               appear (they are found asynchronously) -->
          <div v-if="recentSessions.length && messages.length === 0 && !openConflict" class="recent-sessions">
            <div class="recent-header">
              <span class="codicon codicon-history"></span>
              <span>Recent conversations</span>
              <button type="button" class="recent-all" @click="$emit('switchToSessions')">View all</button>
            </div>
            <button
              v-for="s in recentSessions"
              :key="s.sessionId() ?? ''"
              type="button"
              class="recent-row"
              :title="s.summary() || 'Untitled conversation'"
              @click="openRecent(s)"
            >
              <span class="recent-name">{{ s.summary() || 'Untitled conversation' }}</span>
              <span class="recent-ago">{{ formatAgo(s.lastModifiedTime()) }}</span>
            </button>
          </div>
        </div>
      <!-- </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, shallowRef, computed, inject, provide, onMounted, onUnmounted, nextTick, watch } from 'vue';
  import { RuntimeKey } from '../composables/runtimeContext';
  import { useSession } from '../composables/useSession';
  import type { Session } from '../core/Session';
  import type { ToolContext } from '../types/tool';
  import type { AttachmentItem } from '../types/attachment';
  import { convertFileToAttachment } from '../types/attachment';
  import ChatInputBox from '../components/ChatInputBox.vue';
  import MessageQueueList from '../components/MessageQueueList.vue';
  import BackgroundTasksList from '../components/BackgroundTasksList.vue';
  import RateLimitBanner from '../components/RateLimitBanner.vue';
  import { useLiveActivity } from '../composables/useLiveActivity';
  import { isTaskFinished } from '../core/LiveActivity';
  import type { QueuedMessage } from '../types/queue';
  import PermissionRequestModal from '../components/PermissionRequestModal.vue';
  import SessionConflictPrompt from '../components/SessionConflictPrompt.vue';
  import ColdResumePrompt from '../components/ColdResumePrompt.vue';
import ClaudeCodeLogo from '../components/ClaudeCodeLogo.vue';
import OmpLogo from '../components/OmpLogo.vue';
  import type { ColdResumeInfo } from '../core/Session';
  import type { Message } from '../models/Message';
  import { RestoreCheckpointKey } from '../composables/runtimeContext';
  import Spinner from '../components/Messages/WaitingIndicator.vue';
  import MessageRenderer from '../components/Messages/MessageRenderer.vue';
  import TurnView from '../components/Messages/TurnView.vue';
  import StickyPrompt from '../components/Messages/StickyPrompt.vue';
  import { userMessageText } from '../utils/userText';
  import { buildChatItems, formatAgo } from '../utils/turns';
  import { useKeybinding } from '../utils/useKeybinding';
  import { transcriptDetail, toggleTranscriptDetail } from '../composables/useTranscriptDetail';
  import { useSignal } from '@gn8/alien-signals-vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
  import { useModelCatalog } from '../composables/useModelCatalog';
  import { availableModes, nextMode } from '../utils/permissionModes';
  import { isOmp } from '../utils/backend';

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
  const messages = computed<any[]>(() => session.value?.messages.value ?? []);
  const isBusy = computed(() => session.value?.busy.value ?? false);
  // Prompts sent mid-turn, until the CLI takes them in (then they join the transcript)
  const inFlight = computed(() =>
    (session.value?.inFlightPrompts.value ?? []).map((p) => ({ id: p.uuid, content: p.text }))
  );
  const shellRunning = computed(() => session.value?.shellRunning.value ?? false);

  // Turns shown the way Cursor does: one user message + everything the assistant did
  const chatItems = computed(() => buildChatItems(messages.value));
  const lastTurnKey = computed(() => {
    for (let i = chatItems.value.length - 1; i >= 0; i--) {
      if (chatItems.value[i].kind === 'turn') return chatItems.value[i].key;
    }
    return -1;
  });
  // The turn the CLI started on while this page was open (see runningFromKey)
  const liveTurnKey = ref(-1);
  // A prompt sent mid-turn (Ctrl+U, "Send immediately") starts a new turn in the
  // transcript while the CLI's turn goes on: every turn from the one the CLI
  // started on is still running, so the earlier one (its Agent cards...) must
  // not fold until the CLI is done. Without a known start (page opened during
  // the turn, stale key from another conversation) only the last turn runs.
  const runningFromKey = computed(() =>
    liveTurnKey.value >= 0 && liveTurnKey.value <= lastTurnKey.value ? liveTurnKey.value : lastTurnKey.value
  );
  // Spinner line: time and tokens of the turn running now
  const activity = useLiveActivity();
  const turnStartedAt = ref<number | undefined>(undefined);
  watch(isBusy, (busy) => {
    if (busy) {
      liveTurnKey.value = lastTurnKey.value;
      turnStartedAt.value = Date.now();
      activity.beginTurn();
    }
  });
  const permissionMode = computed(
    () => session.value?.permissionMode.value ?? 'default'
  );
  const permissionRequests = computed(
    () => session.value?.permissionRequests.value ?? []
  );
  const permissionRequestsLen = computed(() => permissionRequests.value.length);
  const pendingPermission = computed(() => permissionRequests.value[0] as any);
  // A plan to approve or a question to answer is decided by reading the
  // transcript above (the plan card, Claude's reasoning): keep it readable.
  const dimTranscript = computed(() => {
    const tool = pendingPermission.value?.toolName;
    return permissionRequestsLen.value > 0 && tool !== 'ExitPlanMode' && tool !== 'AskUserQuestion';
  });

  // Capabilities of the selected model, as the CLI reports them. Everything
  // below follows these flags, so a CLI update needs no change here.
  const { findModelInfo, availableModels } = useModelCatalog();
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

  // Auto is the default mode: a session nobody picked a mode for switches to it
  // as soon as the model allows it (supportsAutoMode, known once the model
  // list has loaded). Overrides the CLI's `permissions.defaultMode`; a mode
  // picked by the user (picker, Shift+Tab) is never touched.
  watch(
    () => [activeSessionRaw.value, modes.value.some((m) => m.id === 'auto')] as const,
    ([raw, autoAvailable]) => {
      if (!raw || !autoAvailable || raw.hasExplicitPermissionMode) return;
      void raw.setPermissionMode('auto', true, true);
    },
    { immediate: true }
  );

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
  const inputContainerEl = ref<HTMLDivElement | null>(null);

  // Height of the idle input in an empty chat, measured once when the chat
  // becomes empty: the CSS centers that height, so the input's top edge stays
  // put while a panel or a longer prompt makes it taller.
  const emptyInputHeight = ref(0);
  // CLI version under the empty-chat logo (`claude --version`, cached by the host)
  const cliVersion = ref<string | undefined>();
  void runtime.sessionStore.getConnection()
    .then((c) => c.getCliVersion())
    .then((v) => { cliVersion.value = v; })
    .catch(() => {});
  watch(
    () => messages.value.length === 0,
    async (empty) => {
      if (!empty) return;
      emptyInputHeight.value = 0;
      await nextTick();
      emptyInputHeight.value = inputContainerEl.value?.offsetHeight ?? 0;
    },
    { immediate: true }
  );
  const endEl = ref<HTMLDivElement | null>(null);

  // Attachment state
  const attachments = ref<AttachmentItem[]>([]);

  // Remember the last message count, to tell new rows from re-renders
  let prevCount = 0;

  // ---- Following the latest output ----
  // While the view is at the bottom it stays there: new rows and text streaming
  // into the last one keep it pinned. Scrolled up, nothing moves it (except the
  // user's own message and a permission prompt); new rows only light up the
  // "↓" button, which goes back to the bottom.

  /** Distance from the bottom (px) still counted as "at the bottom" */
  const FOLLOW_SLACK = 10;
  /** The view is at the bottom and follows new output */
  let following = true;
  /** New rows arrived while scrolled up */
  const newBelow = ref(false);

  function atBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK;
  }

  /** scrollTop at the previous scroll event: only a move up means the user left the bottom */
  let lastScrollTop = 0;

  function onFollowScroll(): void {
    const el = containerEl.value;
    if (!el) return;
    const top = el.scrollTop;
    // A scroll event fires a frame after the scroll that caused it. If a row grew
    // in between (streaming text, a new message), the view looks "not at the
    // bottom" though nobody scrolled; judging by atBottom() alone used to drop
    // following right then. Content growing never lowers scrollTop, so only a
    // move up (wheel, keys, scrollbar, jumping to a prompt) stops following.
    if (atBottom(el)) following = true;
    else if (top < lastScrollTop - 1) following = false;
    lastScrollTop = top;
    if (following) newBelow.value = false;
  }

  /** Synchronous: called from ResizeObserver, before the frame is painted */
  function stickToBottom(): void {
    const el = containerEl.value;
    if (following && el) el.scrollTop = el.scrollHeight;
  }

  /** Back to the bottom and following again (session switch, own message, "↓") */
  function followLatest(): void {
    following = true;
    newBelow.value = false;
    scrollToBottom();
  }

  // Rows grow without a scroll event (streaming text, a tool result, a block
  // opening): watch every row's size, plus the container's (the input growing).
  let followResize: ResizeObserver | undefined;
  let followRows: MutationObserver | undefined;
  watch(containerEl, (el, old) => {
    old?.removeEventListener('scroll', onFollowScroll);
    followResize?.disconnect();
    followRows?.disconnect();
    if (!el) return;
    el.addEventListener('scroll', onFollowScroll, { passive: true });
    const resize = (followResize = new ResizeObserver(stickToBottom));
    resize.observe(el);
    for (const child of el.children) resize.observe(child);
    followRows = new MutationObserver(records => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof Element) resize.observe(n);
        for (const n of r.removedNodes) if (n instanceof Element) resize.unobserve(n);
      }
    });
    followRows.observe(el, { childList: true });
  });

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
    followLatest();
  });

  // moved above

  watch(
    () => messages.value.length,
    async len => {
      const increased = len > prevCount;
      prevCount = len;
      if (!increased) return;
      await nextTick();
      if (following) scrollToBottom();
      else newBelow.value = true;
    }
  );

  watch(permissionRequestsLen, async () => {
    // A permission request waits for the user: always show the tool call it is about
    await nextTick();
    followLatest();
  });

  onMounted(async () => {
    prevCount = messages.value.length;
    await nextTick();
    followLatest();
  });

  // ---- Sticky prompt: the user message of the turn at the top of the view ----

  /** Key of the turn whose prompt is pinned; null while that prompt's own bubble is fully in view */
  const stickyKey = ref<number | null>(null);
  /** The real bubble's box, relative to .main: the pinned copy takes the same left edge and width */
  const stickyBox = ref({ left: 0, width: 0 });
  /** px the next turn's bubble pushes the pinned copy up by (<= 0) */
  const stickyShift = ref(0);
  /** The copy shows only while the transcript scrolls (and while the pointer is on it) */
  const stickyScrolling = ref(false);
  const stickyHovered = ref(false);
  let stickyFrame = 0;
  let stickyIdle: ReturnType<typeof setTimeout> | undefined;

  /** Gap between the top of the transcript and the pinned copy (StickyPrompt's top) */
  const STICKY_TOP = 2;
  /** Height of the one-line copy (22px line + 2 × 8px padding + 2 × 1px border) */
  const STICKY_HEIGHT = 40;
  /** Hidden this long after the last scroll, like an overlay scrollbar */
  const STICKY_IDLE_MS = 800;

  function updateStickyPrompt(): void {
    stickyFrame = 0;
    const container = containerEl.value;
    if (!container) { stickyKey.value = null; return; }
    // Scrolled all the way down: reading the latest output, pin nothing
    if (container.scrollHeight - container.scrollTop - container.clientHeight <= 2) {
      stickyKey.value = null;
      return;
    }
    const top = container.getBoundingClientRect().top;
    const pin = top + STICKY_TOP;
    let current: { key: number; bubble: HTMLElement } | null = null;
    let nextTop: number | null = null;
    for (const el of container.querySelectorAll<HTMLElement>('[data-turn-key]')) {
      const bubble = el.querySelector<HTMLElement>('.user-message .message-text');
      if (!bubble) continue;
      const bubbleTop = bubble.getBoundingClientRect().top;
      // Pinned once its top edge has gone under the top of the view
      if (bubbleTop >= top) { nextTop = bubbleTop; break; }
      current = { key: Number(el.dataset.turnKey), bubble };
    }
    if (!current) { stickyKey.value = null; return; }
    const host = container.parentElement!.getBoundingClientRect();
    const rect = current.bubble.getBoundingClientRect();
    stickyKey.value = current.key;
    stickyBox.value = { left: rect.left - host.left, width: rect.width };
    stickyShift.value = nextTop === null ? 0 : Math.min(0, nextTop - pin - STICKY_HEIGHT - 6);
  }

  function onStickyScroll(): void {
    stickyScrolling.value = true;
    clearTimeout(stickyIdle);
    stickyIdle = setTimeout(() => (stickyScrolling.value = false), STICKY_IDLE_MS);
    scheduleStickyPrompt();
  }

  function onStickyHover(on: boolean): void {
    stickyHovered.value = on;
    // Leaving the copy starts the idle countdown over, so it does not vanish under the pointer's exit
    if (!on) onStickyScroll();
  }

  // The copy can go away under the pointer (jump, scrolled back down) without a mouseleave
  watch(stickyKey, (key) => { if (key === null) stickyHovered.value = false; });

  function scheduleStickyPrompt(): void {
    if (!stickyFrame) stickyFrame = requestAnimationFrame(updateStickyPrompt);
  }

  const stickyText = computed(() => {
    if (stickyKey.value === null || dimTranscript.value) return '';
    const item = chatItems.value.find(i => i.key === stickyKey.value);
    const user = item?.kind === 'turn' ? item.user : undefined;
    return user ? userMessageText(user).replace(/\s+/g, ' ').trim() : '';
  });

  function jumpToStickyPrompt(): void {
    const key = stickyKey.value;
    if (key === null) return;
    containerEl.value
      ?.querySelector<HTMLElement>(`[data-turn-key="${key}"] .user-message`)
      ?.scrollIntoView({ block: 'start' });
  }

  let stickyResize: ResizeObserver | undefined;
  watch(containerEl, (el, old) => {
    old?.removeEventListener('scroll', onStickyScroll);
    stickyResize?.disconnect();
    if (!el) return;
    el.addEventListener('scroll', onStickyScroll, { passive: true });
    stickyResize = new ResizeObserver(scheduleStickyPrompt);
    stickyResize.observe(el);
    scheduleStickyPrompt();
  });
  watch(chatItems, () => nextTick(scheduleStickyPrompt));

  onUnmounted(() => {
    containerEl.value?.removeEventListener('scroll', onStickyScroll);
    clearTimeout(stickyIdle);
    stickyResize?.disconnect();
    containerEl.value?.removeEventListener('scroll', onFollowScroll);
    followResize?.disconnect();
    followRows?.disconnect();
    if (stickyFrame) cancelAnimationFrame(stickyFrame);
    try { unregisterToggle?.(); } catch {}
  });

  // ---- Opening a conversation another tab already has (SessionStore.openExisting) ----

  const openConflict = useSignal(runtime.sessionStore.openConflict);

  function focusConflictOwner() {
    const conflict = openConflict.value;
    runtime!.sessionStore.openConflict(undefined);
    if (!conflict) return;
    void runtime!.sessionStore.getConnection().then((c) => c.focusTab(conflict.owner.tabId));
  }

  function forkConflict() {
    const conflict = openConflict.value;
    if (conflict) runtime!.sessionStore.openFork(conflict.session);
  }

  function cancelConflict() {
    runtime!.sessionStore.openConflict(undefined);
  }

  // ---- Recent conversations (the first is `claude --continue`) ----

  // The most recent conversations not open in another tab, offered while this
  // tab is still empty. Open ones are skipped: the newest is usually the one
  // the user is working on next door, which opening here would collide with.
  const RECENT_COUNT = 5;
  const sessionsByRecent = useSignal(runtime.sessionStore.sessionsByLastModified);
  const recentSessions = shallowRef<Session[]>([]);
  let recentSeq = 0;
  watch(
    () => [messages.value.length === 0 && !session.value?.sessionId.value, sessionsByRecent.value] as const,
    async ([fresh, all]) => {
      const seq = ++recentSeq;
      if (!fresh) {
        recentSessions.value = [];
        return;
      }
      const active = activeSessionRaw.value;
      // A few spare in case some are open in other tabs
      const candidates = (all as Session[])
        .filter((s) => s !== active && !!s.sessionId())
        .slice(0, RECENT_COUNT * 2);
      let found: Session[];
      try {
        const connection = await runtime!.sessionStore.getConnection();
        const owners = await Promise.all(candidates.map((c) => connection.getSessionOwner(c.sessionId()!)));
        found = candidates.filter((_, i) => !owners[i]);
      } catch {
        found = candidates;
      }
      if (seq === recentSeq) recentSessions.value = found.slice(0, RECENT_COUNT);
    },
    { immediate: true }
  );

  function openRecent(target: Session) {
    void runtime!.sessionStore.openExisting(target);
  }

  // "Restore checkpoint" on a sent message: Rewind, already on that message
  provide(RestoreCheckpointKey, (message: Message) => chatInputRef.value?.openRewind(message));

  async function createNew(): Promise<void> {
    // Tabs are managed by the host terminal tab strip, not by this app.
    runtime?.appContext.startNewConversationTab();
  }

  // "Resume this conversation?" (the CLI's dialog): asked before a message
  // that would re-send a long context whose prompt cache has expired.
  const coldResume = ref<{ info: ColdResumeInfo; content: string } | null>(null);
  let checkingCold = false;
  // Another conversation in this view: the question was about the old one
  watch(session, () => {
    coldResume.value = null;
  });

  function closeCold(): string | undefined {
    const pending = coldResume.value;
    session.value?.markColdResumeAsked();
    coldResume.value = null;
    return pending?.content;
  }

  function resumeCold() {
    const content = closeCold();
    if (content === undefined) return;
    chatInputRef.value?.setContent('');
    void handleSubmit(content);
  }

  /** As in the CLI: a fresh conversation here, the typed message kept in the input */
  function newConversationCold() {
    closeCold();
    void session.value?.send('/clear').catch((e) => console.error('[ChatPage] /clear failed', e));
    chatInputRef.value?.focus();
  }

  function dismissCold() {
    closeCold();
    chatInputRef.value?.focus();
  }

  // ChatInput event handling
  async function handleSubmit(content: string) {
    const s = session.value;
    const trimmed = (content || '').trim();
    if (!s || (!trimmed && attachments.value.length === 0) || isBusy.value) return;
    if (coldResume.value || checkingCold) {
      chatInputRef.value?.setContent(content);
      return;
    }
    // Slash commands (/clear, /compact...) are the answer, not a message to price
    if (!isOmp && !trimmed.startsWith('/')) {
      checkingCold = true;
      let cold: ColdResumeInfo | undefined;
      try {
        cold = await s.checkColdResume();
      } finally {
        checkingCold = false;
      }
      if (cold && s === session.value) {
        // The input cleared itself on Enter: the message waits there
        chatInputRef.value?.setContent(content);
        coldResume.value = { info: cold, content };
        return;
      }
    }
    followLatest();

    try {
      // Pass the attachments to send
      await s.send(trimmed || ' ', attachments.value);

      // Clear the attachments after a successful send
      attachments.value = [];
    } catch (e) {
      console.error('[ChatPage] send failed', e);
    }
  }

  // Typed while Claude is working: straight to the CLI's queue, as in the CLI.
  // It folds the prompt into the running turn between two tool rounds (or runs
  // it next, a `/command` always after the turn); until then it is listed above
  // the input (Session.inFlightPrompts). Held here instead only when that send
  // fails: then it goes out when the turn ends, or at once with Ctrl+U.
  // Consecutive held prompts go out as one message; a `/command` on its own.
  type QueuedEntry = QueuedMessage & { attachments: AttachmentItem[] };
  const queuedMessages = ref<QueuedEntry[]>([]);
  const chatInputRef = ref<InstanceType<typeof ChatInputBox> | null>(null);
  let queueSeq = 0;
  let flushingQueue = false;

  async function handleQueueMessage(content: string) {
    const trimmed = (content || '').trim();
    if (!trimmed && attachments.value.length === 0) return;
    const s = session.value;
    const files = attachments.value;
    if (s) {
      attachments.value = [];
      try {
        await s.send(trimmed || ' ', files);
        return;
      } catch (e) {
        console.error('[ChatPage] send failed, holding the prompt', e);
        attachments.value = files;
      }
    }
    queuedMessages.value = [
      ...queuedMessages.value,
      {
        id: `queued-${++queueSeq}`,
        content: trimmed,
        timestamp: Date.now(),
        attachments: attachments.value,
      },
    ];
    attachments.value = [];
    // The turn may have ended between the keypress and here
    if (!isBusy.value) void flushQueue();
  }

  function handleQueueRemove(id: string) {
    queuedMessages.value = queuedMessages.value.filter((m) => m.id !== id);
  }

  // "Send immediately": straight to the CLI, which takes it in during the turn
  async function handleQueueSendNow(id: string) {
    const s = session.value;
    const entry = queuedMessages.value.find((m) => m.id === id);
    if (!s || !entry) return;
    handleQueueRemove(id);
    followLatest();
    try {
      await s.send(entry.content || ' ', entry.attachments);
    } catch (e) {
      console.error('[ChatPage] send failed', e);
    }
  }

  /** Ctrl+U: every queued prompt straight to the CLI, in queue order */
  async function handleQueueSendAll() {
    for (const entry of [...queuedMessages.value]) {
      await handleQueueSendNow(entry.id);
    }
  }

  async function flushQueue() {
    const s = session.value;
    if (!s || flushingQueue || isBusy.value || queuedMessages.value.length === 0) return;
    const queue = queuedMessages.value;
    const isCommand = (m: QueuedEntry) => m.content.startsWith('/');
    let count = 1;
    if (!isCommand(queue[0])) {
      while (count < queue.length && !isCommand(queue[count])) count++;
    }
    const batch = queue.slice(0, count);
    queuedMessages.value = queue.slice(count);
    flushingQueue = true;
    try {
      await s.send(
        batch.map((m) => m.content).filter(Boolean).join('\n') || ' ',
        batch.flatMap((m) => m.attachments)
      );
    } catch (e) {
      console.error('[ChatPage] send failed', e);
      // Not sent: back at the head of the queue
      queuedMessages.value = [...batch, ...queuedMessages.value];
    } finally {
      flushingQueue = false;
    }
  }

  watch(isBusy, (busy) => {
    if (!busy) void flushQueue();
  });

  // A conversation switch (/resume, /clear in a new tab...) does not carry the queue over
  watch(activeSessionRaw, () => {
    queuedMessages.value = [];
    liveTurnKey.value = -1;
  });

  // `!command` (bash mode): runs outside the model, even while a turn runs
  async function handleBash(command: string) {
    const s = session.value;
    if (!s) return;
    followLatest();
    try {
      await s.__session.runShell(command);
    } catch (e) {
      console.error('[ChatPage] bash failed', e);
    }
  }

  // Commands from a panel (`/config` with values the CLI only takes one per
  // command). Sent one after another; the CLI runs queued input in order.
  async function handleRunCommands(commands: string[]) {
    const s = session.value;
    if (!s) return;
    for (const command of commands) {
      try {
        await s.send(command);
      } catch (e) {
        console.error('[ChatPage] send failed', e);
        return;
      }
    }
  }

  async function handleToggleThinking() {
    const s = session.value;
    if (!s) return;

    const currentLevel = s.thinkingLevel.value;
    const newLevel = currentLevel === 'off' ? 'default_on' : 'off';

    await s.setThinkingLevel(newLevel);
  }

  async function handleEffortSelect(level: string, persist = false) {
    const s = session.value;
    if (!s) return;

    await s.setEffortLevel(level, persist);
  }

  async function handleModeSelect(mode: PermissionMode) {
    const s = session.value;
    if (!s) return;

    await s.setPermissionMode(mode);
  }

  // permissionMode.toggle: cycle through the modes on offer, in the CLI's order
  const togglePermissionMode = () => {
    if (isOmp) return;
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

  // Ctrl+O: fold every turn's steps behind "Worked for", and back
  useKeybinding({
    keys: 'ctrl+o',
    handler: toggleTranscriptDetail,
    allowInEditable: true,
    priority: 50,
  });

  // Ctrl+U sends the queued prompts now, like their "Send immediately" buttons.
  // Only with a queue: otherwise the key goes on to the workbench as before.
  useKeybinding({
    keys: 'ctrl+u',
    handler: () => void handleQueueSendAll(),
    allowInEditable: true,
    priority: 50,
    when: () => queuedMessages.value.length > 0 && !pendingPermission.value,
  });

  // Esc stops the running turn (or bash-mode command), as in Claude Code. Not
  // while a permission prompt or a dropdown (completion, pickers) is open: Esc
  // closes those.
  useKeybinding({
    keys: 'escape',
    handler: () => {
      if (shellRunning.value) session.value?.__session.cancelShell();
      else handleStop();
    },
    allowInEditable: true,
    priority: 50,
    when: () =>
      (isBusy.value || shellRunning.value) &&
      !pendingPermission.value &&
      !inTaskList() &&
      !document.querySelector('.dropdown-popover') &&
      !document.querySelector('.command-panel'),
  });

  let forwardingEscape = false;
  // Esc with a prompt open (question, tool permission, plan) but the focus
  // outside it (a click on the question text, the chat input): cancel the
  // prompt as its own Esc would, instead of doing nothing.
  useKeybinding({
    keys: 'escape',
    handler: () => {
      const list = document.querySelector<HTMLElement>('[data-permission-panel] .prompt-options');
      if (!list || forwardingEscape) return;
      list.focus();
      // The synthetic event passes this keybinding again (capture phase): the flag
      // keeps it from forwarding twice if the list could not take the focus.
      forwardingEscape = true;
      try {
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      } finally {
        forwardingEscape = false;
      }
    },
    allowInEditable: true,
    priority: 60,
    when: () => {
      if (!pendingPermission.value || forwardingEscape || inTaskList()) return false;
      if (document.querySelector('.dropdown-popover') || document.querySelector('.command-panel')) return false;
      const panel = document.querySelector('[data-permission-panel]');
      return !!panel && !panel.contains(document.activeElement);
    },
  });

  // The CLI can switch model by itself (`/model <name>` typed in the chat);
  // follow it so the picker shows, and the next launch sends, what is really
  // running. The CLI reports a model ID, so pick the picker entry resolving to
  // it — a named model over "Default" — or keep the ID as is.
  // Only a change between two reads of the same session counts: the first read
  // after a launch just reports the ID behind the selection (`opus[1m]` runs as
  // `claude-opus-5-5`), which must not replace it.
  watch(
    () => [session.value, session.value?.cliModel.value] as const,
    ([s, running], [prevSession, prevRunning]) => {
      if (!s || !running || s !== prevSession || !prevRunning || running === prevRunning) return;
      const selected = s.modelSelection.value;
      const current = findModelInfo(selected);
      if ((current?.resolvedModel ?? selected) === running) return;
      const matches = availableModels.value.filter((m) => m.info?.resolvedModel === running);
      const entry = matches.find((m) => m.id !== 'default') ?? matches[0];
      s.adoptModel(entry?.id ?? running);
    }
  );

  // A resumed conversation brings back the model ID it ran with
  // (Session.applyResumedSettings); show it as the picker entry resolving to
  // that ID — a named model over "Default", the 1M variant only for a 1M ID.
  watch(
    () => [session.value, session.value?.modelSelection.value, availableModels.value] as const,
    ([s, selected, models]) => {
      if (!s || !selected || !models.length) return;
      if (models.some((m) => m.id === selected)) return;
      const matches = models.filter((m) => m.info?.resolvedModel === selected);
      if (!matches.length) return;
      const wide = selected.includes('[1m]');
      const entry =
        matches.find((m) => m.id !== 'default' && m.id.includes('[1m]') === wide) ??
        matches.find((m) => m.id !== 'default') ??
        matches[0];
      s.adoptModel(entry.id);
    }
  );

  async function handleModelSelect(modelId: string) {
    const s = session.value;
    if (!s) return;

    await s.setModel({ value: modelId });
  }

  /**
   * Queued prompts leave the queue and go back into the input, ahead of what
   * is typed there: on interrupt, and on ↑ to edit them (as the CLI does).
   */
  function restoreQueueToInput() {
    const queued = queuedMessages.value;
    if (queued.length === 0) return;
    queuedMessages.value = [];
    const typed = chatInputRef.value?.getContent() ?? '';
    const text = [...queued.map((m) => m.content), typed].filter((t) => t.trim()).join('\n');
    chatInputRef.value?.setContent(text);
    attachments.value = [...queued.flatMap((m) => m.attachments), ...attachments.value];
  }

  /**
   * Every queued prompt back into the input (Esc, ↑ to edit), as the CLI does:
   * first those already in the CLI's queue (taken back, so they do not run),
   * then any still held here. One the CLI already took in stays in the turn.
   */
  async function pullQueueToInput() {
    const s = session.value;
    const pulled = s ? await s.__session.withdrawInFlight() : [];
    restoreQueueToInput();
    if (pulled.length === 0) return;
    const current = chatInputRef.value?.getContent() ?? '';
    chatInputRef.value?.setContent([...pulled.map((p) => p.text), current].filter((t) => t.trim()).join('\n'));
    const restored: AttachmentItem[] = pulled.flatMap((p) => p.attachments).map((a, i) =>
      'id' in a ? (a as AttachmentItem) : { ...a, id: `restored-q-${Date.now()}-${i}`, fileSize: a.fileSize ?? 0 }
    );
    attachments.value = [...restored, ...attachments.value];
  }

  async function editQueued() {
    await pullQueueToInput();
    chatInputRef.value?.focus();
  }

  // Ctrl+B. The CLI's own Ctrl+B with nothing in the foreground arms a second
  // press that moves the whole session to the background; a tab keeps running
  // when another one is shown, so here it only says there was nothing to move.
  async function handleBackground() {
    const s = activeSessionRaw.value;
    if (!s) return;
    try {
      const moved = await s.backgroundTasks();
      if (!moved) {
        void runtime?.appContext.showNotification('Nothing is running in the foreground to move to the background', 'info');
      }
    } catch (e) {
      console.error('[ChatPage] Ctrl+B failed', e);
      const message = e instanceof Error ? e.message : String(e);
      void runtime?.appContext.showNotification(`Couldn't move this to the background: ${message}`, 'warning');
    }
  }

  async function handleStop() {
    const s = session.value;
    // Interrupting gives the queued prompts back to the input (as the CLI
    // does), instead of sending them as soon as the turn stops: first those
    // already in the CLI's queue (taken back before the interrupt, which would
    // otherwise run them as the next turn), then the ones still held here.
    await pullQueueToInput();
    if (!s) return;
    // No tool ran yet: like the CLI, the prompt leaves the chat and goes back
    // to the input instead of staying as an interrupted request
    const withdrawn = await s.__session.withdrawLastPrompt();
    if (withdrawn) {
      const typed = chatInputRef.value?.getContent() ?? '';
      const text = [withdrawn.input, typed].filter((t) => t.trim()).join('\n');
      chatInputRef.value?.setContent(text);
      const restored: AttachmentItem[] = withdrawn.attachments.map((a, i) =>
        'id' in a ? (a as AttachmentItem) : { ...a, id: `restored-${Date.now()}-${i}`, fileSize: a.fileSize ?? 0 }
      );
      attachments.value = [...restored, ...attachments.value];
    } else if (s.__session.busy()) {
      // Methods are already bound in useSession and can be called directly
      void s.interrupt();
    }
  }

  // ---- Background shells (Bash with run_in_background) ----

  const tasksListRef = ref<InstanceType<typeof BackgroundTasksList> | null>(null);
  /** The background tasks dialog is open, in the input's place */
  const tasksDialogOpen = ref(false);
  const hasRunningTasks = computed(() =>
    activity.backgroundTasks.value.some((t) => !isTaskFinished(activity.tasks.value[t.taskId])) ||
    Object.values(activity.tasks.value).some((t) => t.backgrounded && !isTaskFinished(t))
  );
  /** Keys typed in the task list stay there (its Esc goes back to the input) */
  const inTaskList = () => !!document.activeElement?.closest('.bg-tasks');

  const readTaskOutput = async (path: string) =>
    (await runtime!.sessionStore.getConnection()).readTaskOutput(path, 64 * 1024);

  function toolResultText(result: any): string {
    const content = result?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
    }
    return '';
  }

  /**
   * The Bash call that started background task `taskId`: matched by its
   * tool_use id, else by the task id its result names ("…with ID: <id>").
   * The result also names the file the output goes to.
   */
  function findBackgroundShell(taskId: string, toolUseId?: string) {
    const all = messages.value;
    for (let i = all.length - 1; i >= 0; i--) {
      const content = all[i]?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const wrapper of content) {
        const block = wrapper?.content;
        if (block?.type !== 'tool_use' || block.name !== 'Bash' || !block.input?.run_in_background) continue;
        const result = typeof wrapper.toolResult === 'function' ? wrapper.toolResult() : undefined;
        const text = toolResultText(result) || String(wrapper.toolUseResult?.stdout ?? '');
        const useResult = wrapper.toolUseResult;
        const matches =
          (toolUseId && block.id === toolUseId) ||
          useResult?.backgroundTaskId === taskId ||
          text.includes(taskId);
        if (!matches) continue;
        const file = /written to:\s*(\S+\.output)/i.exec(text)?.[1];
        return { command: String(block.input.command ?? ''), outputFile: file };
      }
    }
    return undefined;
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

</script>

<style scoped>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Slim action bar: 35px, hairline below */
  .chat-header {
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    height: 35px;
    flex-shrink: 0;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--cs-fg-12));
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
    /* Bottom padding = the fade below, so the last row clears it when scrolled down */
    padding: 10px 0 var(--cs-transcript-fade);
    position: relative;
    /* Rows scrolling down under the input fade out (as in Cursor), instead of
       a hard edge. A mask, not a gradient overlay: it needs no background
       colour, which differs between the side bar and the Agent-mode panel. */
    --cs-transcript-fade: 28px;
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--cs-transcript-fade)), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - var(--cs-transcript-fade)), transparent);
  }
  /* Wide pane (Agent-mode main panel): one centred column. The scrollbar stays
     at the pane edge since the scroll container itself keeps the full width. */
  .messagesContainer > *,
  .main > .inputContainer {
    width: 100%;
    max-width: var(--cs-column-max);
    margin-inline: auto;
  }
  .spinnerRow {
    padding: 0 calc(var(--cs-edge) + var(--cs-row-inset));
  }
  /* The row already insets it to the text column; drop the spinner's own indent */
  .spinnerRow :deep(.spinner) {
    padding-left: 0;
  }
  .detail-badge {
    position: absolute;
    top: 4px;
    right: 12px;
    z-index: 2;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 11px;
    line-height: 18px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--cs-fg-12);
    pointer-events: none;
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
    position: relative;
  }

  .new-below {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 12px;
    line-height: 18px;
    color: var(--vscode-foreground);
    cursor: pointer;
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--cs-fg-20);
    border-radius: 999px;
    box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.35);
    transition: border-color 0.15s ease;
  }

  .new-below:hover {
    border-color: var(--cs-fg-36);
  }

  .queueList {
    margin-bottom: 4px;
  }

  /* Empty chat: the input sits in the middle of the pane, its top edge fixed
     there (where the idle input's top is when centered), so a command panel
     or a longer prompt grows it downward only. With messages it is pinned to
     the bottom and grows upward. The spacer shrinks when space runs out. */
  .recent-sessions {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    min-width: 0;
    margin-top: 6px;
    font-size: 12px;
  }
  .recent-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    color: var(--cs-fg-52);
  }
  .recent-header .codicon {
    font-size: 13px;
  }
  .recent-all {
    margin-left: auto;
    padding: 0 4px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--cs-fg-52);
    font: inherit;
    cursor: pointer;
  }
  .recent-all:hover {
    color: var(--cs-fg);
    background: var(--cs-fg-8);
  }
  .recent-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    padding: 4px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--cs-fg-66);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .recent-row:hover,
  .recent-row:focus-visible {
    background: var(--cs-fg-8);
    color: var(--cs-fg);
  }
  .recent-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent-ago {
    flex-shrink: 0;
    color: var(--cs-fg-36);
  }

  .main.is-empty {
    justify-content: flex-start;
  }
  .empty-top {
    flex: 0 1 calc(50% - var(--empty-input-height, 160px) / 2);
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 24px;
    overflow: hidden;
    container-type: size;
  }
  /* Too little room above the input: no half-clipped logo */
  @container (max-height: 90px) {
    .empty-top > * { visibility: hidden; }
  }
  .main.is-empty > .messagesContainer {
    display: none;
  }

  /* Pin the bottom dialog area to the bottom, full pane width */
  .main > :last-child {
    flex-shrink: 0;
    width: 100%;
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
