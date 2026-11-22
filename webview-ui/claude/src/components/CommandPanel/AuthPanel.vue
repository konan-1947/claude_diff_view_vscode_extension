<template>
  <!-- `/login`, `/logout`: `claude auth login|logout` run by the extension.
       Login: pick the account type, the CLI opens the browser and prints the
       sign-in URL, the code shown on that page can be pasted here when the
       browser cannot hand it back. Open conversations restart afterwards, with
       the new credentials. -->
  <CommandPanel
    ref="panelRef"
    :title="mode === 'login' ? 'Log in' : 'Log out'"
    :subtitle="statusLine"
    :actions="actions"
    :hint="hint"
    :persistent="stage === 'starting' || stage === 'waiting'"
    @cancel="emit('close')"
    @key="onKey"
  >
    <div v-if="stage === 'loading'" class="ap-empty">Loading…</div>

    <div v-else-if="stage === 'choose'" class="ap-list" role="listbox">
      <div
        v-for="(item, i) in chooseItems"
        :key="item.value"
        role="option"
        :aria-selected="i === index"
        :class="['ap-row', { active: i === index }]"
        @mousedown.prevent
        @mouseenter="index = i"
        @click="pick(i)"
      >
        <span class="ap-num">{{ i + 1 }}</span>
        <span class="ap-label">{{ item.label }}</span>
        <span v-if="item.detail" class="ap-detail">{{ item.detail }}</span>
      </div>
    </div>

    <div v-else-if="stage === 'email'" class="ap-form">
      <input
        ref="inputRef"
        v-model="email"
        class="ap-input"
        type="email"
        spellcheck="false"
        placeholder="Work email for SSO"
      />
    </div>

    <div v-else-if="stage === 'starting'" class="ap-empty">Starting sign-in…</div>

    <div v-else-if="stage === 'waiting'" class="ap-form">
      <div class="ap-muted">
        {{ url ? 'Finish signing in in the browser. If it did not open, open this link:' : 'Waiting for the CLI to print the sign-in link…' }}
      </div>
      <a v-if="url" class="ap-url" :title="url" href="#" @mousedown.prevent @click.prevent="openUrl">{{ url }}</a>
      <input
        ref="inputRef"
        v-model="code"
        class="ap-input"
        type="text"
        spellcheck="false"
        placeholder="Paste the code from the browser page, if it shows one"
      />
      <div v-if="codeSent" class="ap-muted">Code sent, checking…</div>
    </div>

    <div v-else-if="stage === 'working'" class="ap-empty">Logging out…</div>

    <div v-else-if="stage === 'done'" class="ap-done">
      <span class="codicon codicon-check ap-ok" />
      <span>{{ doneText }}</span>
    </div>

    <div v-if="errorText" class="ap-error">{{ errorText }}</div>
    <div v-if="note" class="ap-muted ap-note">{{ note }}</div>
  </CommandPanel>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import CommandPanel, { type CommandPanelAction } from './CommandPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { AuthLoginMethod, AuthStatusInfo } from '@shared/messages'

const props = defineProps<{ mode: 'login' | 'logout' }>()

const emit = defineEmits<{
  (e: 'close'): void
  /** `/logout` when signed out: switch to the login panel */
  (e: 'switchMode', mode: 'login' | 'logout'): void
}>()

type Stage = 'loading' | 'choose' | 'email' | 'starting' | 'waiting' | 'working' | 'done'

const runtime = inject(RuntimeKey)
const panelRef = ref<InstanceType<typeof CommandPanel>>()
const inputRef = ref<HTMLInputElement>()

const stage = ref<Stage>('loading')
const status = ref<AuthStatusInfo>()
const index = ref(0)
const email = ref('')
const code = ref('')
const codeSent = ref(false)
const url = ref<string>()
const loginId = ref<string>()
const finished = ref(false)
const errorText = ref('')
const doneText = ref('')

async function connection() {
  return runtime?.connectionManager.get()
}

const PLAN_LABELS: Record<string, string> = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise' }

function describe(s: AuthStatusInfo | undefined): string {
  if (!s) return ''
  if (!s.loggedIn) return 'not signed in'
  const who = s.email ?? (s.authMethod === 'api_key' ? 'API key' : s.authMethod) ?? 'signed in'
  const plan = s.subscriptionType ? PLAN_LABELS[s.subscriptionType] ?? s.subscriptionType : ''
  return [`signed in as ${who}`, plan].filter(Boolean).join('   ')
}

const statusLine = computed(() => describe(status.value))

interface ChooseItem {
  value: string
  label: string
  detail?: string
}

const chooseItems = computed<ChooseItem[]>(() =>
  props.mode === 'login'
    ? [
        { value: 'claudeai', label: 'Claude account with subscription', detail: 'Pro, Max, Team or Enterprise' },
        { value: 'console', label: 'Anthropic Console account', detail: 'API usage billing' },
        { value: 'sso', label: 'Single sign-on (SSO)', detail: 'organization login' },
      ]
    : [
        { value: 'logout', label: 'Log out', detail: status.value?.email ?? '' },
        { value: 'cancel', label: 'Cancel' },
      ]
)

const note = computed(() => {
  if (stage.value === 'choose' && props.mode === 'login' && status.value?.loggedIn) {
    return 'Signing in again replaces the current account. Open conversations restart with the new one.'
  }
  if (stage.value === 'choose' && props.mode === 'logout') {
    return 'Open conversations stop; send a message after /login to continue.'
  }
  return ''
})

const hint = computed(() => {
  switch (stage.value) {
    case 'choose':
      return ['↑/↓ to select', 'Enter to confirm', 'Esc to cancel']
    case 'email':
      return ['Enter to continue', 'Esc to cancel']
    case 'waiting':
      return ['Enter to send the code', 'Esc to cancel the sign-in']
    case 'done':
      return ['Enter or Esc to close']
    default:
      return ['Esc to cancel']
  }
})

const actions = computed<CommandPanelAction[]>(() => {
  if (stage.value === 'waiting') {
    const list: CommandPanelAction[] = []
    if (url.value) list.push({ label: 'Open browser', run: openUrl })
    list.push({ label: 'Send code', key: '↵', primary: true, run: () => void sendCode() })
    return list
  }
  if (stage.value === 'email') {
    return [{ label: 'Continue', key: '↵', primary: true, run: () => void start('sso') }]
  }
  if (stage.value === 'done' || (stage.value === 'choose' && errorText.value)) {
    return [{ label: 'Close', run: () => emit('close') }]
  }
  return []
})

async function loadStatus() {
  try {
    const result = await (await connection())?.getAuthStatus()
    status.value = result?.status
    if (result?.error) errorText.value = result.error
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  }
}

function focusInput() {
  nextTick(() => inputRef.value?.focus())
}

function pick(i: number) {
  const item = chooseItems.value[i]
  if (!item) return
  errorText.value = ''
  if (props.mode === 'logout') {
    if (item.value === 'logout') void logout()
    else emit('close')
    return
  }
  if (item.value === 'sso') {
    stage.value = 'email'
    email.value = status.value?.email ?? ''
    focusInput()
    return
  }
  void start(item.value as AuthLoginMethod)
}

async function start(method: AuthLoginMethod) {
  stage.value = 'starting'
  errorText.value = ''
  try {
    const result = await (await connection())?.authLogin(method, method === 'sso' ? email.value : undefined)
    if (!result || result.error) {
      fail(result?.error ?? 'Could not start the sign-in')
      return
    }
    loginId.value = result.loginId
    if (result.result) {
      await finish(result.result)
      return
    }
    url.value = result.url
    stage.value = 'waiting'
    focusInput()
    void waitForEnd()
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

async function waitForEnd() {
  const id = loginId.value
  if (!id) return
  try {
    const response = await (await connection())?.authLoginAction(id, 'wait')
    if (id !== loginId.value) return
    await finish(response?.result ?? { ok: false, error: response?.error ?? 'The sign-in ended' })
  } catch (error) {
    if (id === loginId.value) fail(error instanceof Error ? error.message : String(error))
  }
}

async function finish(result: { ok: boolean; error?: string }) {
  finished.value = true
  if (!result.ok) {
    fail(result.error ?? 'Sign-in failed')
    return
  }
  await loadStatus()
  doneText.value = `Signed in${status.value?.email ? ` as ${status.value.email}` : ''}. Open conversations continue with this account.`
  stage.value = 'done'
  nextTick(() => panelRef.value?.focus())
}

function fail(message: string) {
  finished.value = true
  loginId.value = undefined
  errorText.value = message
  codeSent.value = false
  stage.value = 'choose'
  nextTick(() => panelRef.value?.focus())
}

async function sendCode() {
  const id = loginId.value
  const value = code.value.trim()
  if (!id || !value) return
  codeSent.value = true
  code.value = ''
  await (await connection())?.authLoginAction(id, 'code', value)
}

async function openUrl() {
  const id = loginId.value
  if (id) await (await connection())?.authLoginAction(id, 'open_url')
  focusInput()
}

async function logout() {
  stage.value = 'working'
  try {
    const error = await (await connection())?.authLogout()
    if (error) {
      fail(error)
      return
    }
    await loadStatus()
    doneText.value = 'Signed out. Use /login to sign in again.'
    stage.value = 'done'
    nextTick(() => panelRef.value?.focus())
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function onKey(event: KeyboardEvent) {
  const key = event.key
  let handled = true
  if (stage.value === 'choose') {
    const n = chooseItems.value.length
    if (key === 'ArrowDown' || key === 'j') index.value = (index.value + 1) % n
    else if (key === 'ArrowUp' || key === 'k') index.value = (index.value - 1 + n) % n
    else if (key === 'Enter') pick(index.value)
    else if (/^[1-9]$/.test(key) && Number(key) <= n) pick(Number(key) - 1)
    else handled = false
  } else if (stage.value === 'email' && key === 'Enter') {
    void start('sso')
  } else if (stage.value === 'waiting' && key === 'Enter') {
    void sendCode()
  } else if (stage.value === 'done' && key === 'Enter') {
    emit('close')
  } else {
    handled = false
  }
  if (handled) {
    event.preventDefault()
    event.stopPropagation()
  }
}

onMounted(async () => {
  await loadStatus()
  if (props.mode === 'logout' && status.value && !status.value.loggedIn) {
    emit('switchMode', 'login')
    return
  }
  stage.value = 'choose'
  nextTick(() => panelRef.value?.focus())
})

// Closing the panel while the CLI still waits stops that sign-in
onBeforeUnmount(() => {
  const id = loginId.value
  if (id && !finished.value) {
    void connection().then((c) => c?.authLoginAction(id, 'cancel'))
  }
})
</script>

<style scoped>
.ap-list {
  display: flex;
  flex-direction: column;
}

.ap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--cs-fg-74);
}

.ap-row.active {
  background: var(--cs-fg-8);
  color: var(--cs-fg);
}

.ap-num {
  width: 10px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--cs-fg-36);
}

.ap-label {
  flex-shrink: 0;
}

.ap-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cs-fg-36);
}

.ap-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ap-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-textLink-foreground);
  user-select: text;
}

.ap-input {
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

.ap-input:focus {
  border-color: var(--cs-fg-36);
}

.ap-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.ap-done {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ap-ok {
  color: var(--vscode-testing-iconPassed, #3fb950);
}

.ap-empty {
  text-align: center;
  color: var(--cs-fg-36);
}

.ap-muted {
  color: var(--cs-fg-36);
}

.ap-note {
  margin-top: 4px;
}

.ap-error {
  margin-top: 4px;
  color: var(--vscode-errorForeground);
  overflow-wrap: anywhere;
  white-space: pre-line;
}
</style>
