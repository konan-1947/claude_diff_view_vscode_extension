<template>
  <div class="sessions-page">
    <!-- Same 35px strip as the chat page -->
    <div class="chat-header">
      <div class="chat-tab">
        <button class="back-btn" title="Back to chat" @click="$emit('switchToChat')">
          <span class="codicon codicon-arrow-left"></span>
        </button>
        <span class="chat-title">Chat history</span>
      </div>
      <div class="header-right">
        <button class="header-btn" title="New conversation" @click="createNewSession">
          <span class="codicon codicon-add"></span>
        </button>
      </div>
    </div>

    <!-- Search row (Cursor: icon + "Search Agents…") -->
    <div class="search-row">
      <span class="codicon codicon-search"></span>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search chats…"
        @keydown.escape="searchQuery = ''"
      >
    </div>

    <div class="list custom-scroll-container">
      <div v-if="loading" class="note">Loading…</div>

      <div v-else-if="error" class="note">
        <div class="error-message">{{ error }}</div>
        <button class="link-btn" @click="refreshSessions">Retry</button>
      </div>

      <div v-else-if="sessionList.length === 0" class="note">
        No chats yet.
        <button class="link-btn" @click="startNewChat">Start one</button>
      </div>

      <template v-else>
        <div v-for="group in groups" :key="group.label" class="group">
          <div class="group-label">{{ group.label }}</div>
          <button
            v-for="(session, index) in group.items"
            :key="session.sessionId.value || `temp-${group.label}-${index}`"
            class="item"
            @click="openSession(session)"
          >
            <span class="codicon codicon-comment item-icon"></span>
            <span class="item-title">{{ session.summary.value || 'New Conversation' }}</span>
            <span class="item-time">{{ formatRelativeTime(session.lastModifiedTime.value) }}</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSessionStore } from '../composables/useSessionStore';
import { useSession } from '../composables/useSession';
import type { Session } from '../core/Session';

// Inject the runtime
const runtime = inject(RuntimeKey);
if (!runtime) {
  throw new Error('[SessionsPage] runtime not provided');
}

// 🔥 Wrap as a Vue-friendly API with useSessionStore
const store = useSessionStore(runtime.sessionStore);

// 🔥 View model: wrap alien-signals Sessions in a Vue-friendly form
const sessionList = computed(() => {
  const rawSessions = (store.sessionsByLastModified.value || []).filter(Boolean) as Session[];
  return rawSessions.map(raw => useSession(raw));
});

// Define events
const emit = defineEmits<{
  switchToChat: [sessionId?: string];
}>();

// Component state
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');


// Computed: filter and sort the session list
const filteredSessions = computed(() => {
  let sessions = [...sessionList.value];

  // Search filter
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    sessions = sessions.filter(session => {
      const summary = (session.summary.value || '').toLowerCase();
      const sessionId = (session.sessionId.value || '').toLowerCase();
      return summary.includes(query) || sessionId.includes(query);
    });
  }

  // Already sorted newest first by sessionsByLastModified, no need to sort again
  return sessions;
});

// Methods
const refreshSessions = async () => {
  loading.value = true;
  error.value = '';

  try {
    // 🔥 Use the wrapped methods
    await store.listSessions();
  } catch (err) {
    error.value = `Failed to load sessions: ${err}`;
  } finally {
    loading.value = false;
  }
};


const openSession = (wrappedSession: ReturnType<typeof useSession> | undefined) => {
  if (!wrappedSession) return;
  // 🔥 Get the raw Session instance from the wrapper
  const rawSession = wrappedSession.__session;
  store.setActiveSession(rawSession);
  emit('switchToChat', wrappedSession.sessionId.value);
};


const createNewSession = async () => {
  // 🔥 Use the wrapped method (returns the raw Session)
  const rawSession = await store.createSession({ isExplicit: true });
  store.setActiveSession(rawSession);
  // 🔥 Accessing alien-signals requires a function call
  emit('switchToChat', rawSession.sessionId());
};


const startNewChat = () => {
  emit('switchToChat');
};

// Date groups like Cursor's agent history: Today / Yesterday / Last 7 days / Older
const groups = computed(() => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const buckets: { label: string; items: typeof filteredSessions.value }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const s of filteredSessions.value) {
    const t = Number(s.lastModifiedTime.value) || 0;
    const age = startOfToday.getTime() - t;
    if (t >= startOfToday.getTime()) buckets[0].items.push(s);
    else if (age <= day) buckets[1].items.push(s);
    else if (age <= 6 * day) buckets[2].items.push(s);
    else buckets[3].items.push(s);
  }
  return buckets.filter((g) => g.items.length > 0);
});

// Format relative time
function formatRelativeTime(input?: number | string | Date): string {
  if (input === undefined || input === null) return 'just now';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return 'just now';

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))} h ago`;
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 7) return `${days} d ago`;
  return date.toLocaleDateString('zh-CN');
}

// Lifecycle
onMounted(() => {
  refreshSessions();
});
</script>

<style scoped>
.sessions-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--vscode-foreground);
}

/* Strip: identical geometry to ChatPage's header */
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
  padding: 0 10px 0 6px;
  font-size: 13px;
  background: var(--vscode-editor-background);
  margin-bottom: -1px;
  border-right: 1px solid var(--vscode-editorGroupHeader-tabsBorder, var(--cs-fg-12));
}
.chat-title {
  font-size: 13px;
  font-weight: 400;
}
.back-btn,
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
.back-btn:hover,
.header-btn:hover {
  background: var(--cs-fg-8);
}
.back-btn .codicon,
.header-btn .codicon {
  font-size: 16px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
}

/* Search row: 30px, 14px side padding, hairline below */
.search-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--cs-fg-8);
  color: var(--cs-fg-66);
  flex-shrink: 0;
}
.search-row .codicon {
  font-size: 14px;
}
.search-input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--vscode-foreground);
}
.search-input::placeholder {
  color: var(--cs-fg-36);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.group + .group {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--cs-fg-8);
}
.group-label {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  font-size: 12px;
  line-height: 16px;
  color: var(--cs-fg-60);
}

.item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 30px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.item:hover {
  background: var(--cs-fg-8);
}
.item-icon {
  font-size: 14px;
  color: var(--cs-fg-66);
  flex-shrink: 0;
}
.item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--cs-fg-52);
}

.note {
  padding: 14px;
  font-size: 13px;
  color: var(--cs-fg-60);
}
.error-message {
  color: var(--vscode-errorForeground);
  margin-bottom: 6px;
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--vscode-textLink-foreground);
  cursor: pointer;
}
.link-btn:hover {
  text-decoration: underline;
}
</style>
