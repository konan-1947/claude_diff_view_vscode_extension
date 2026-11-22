<template>
  <!-- Rewind (Esc Esc, /rewind): pick a message, then what to restore, like the
       CLI. One panel for both steps, so the input never takes the focus (and
       closes the menu) between them. -->
  <ListPanel
    v-if="step === 'pick'"
    key="pick"
    title="Rewind"
    subtitle="restore the conversation and code to before a message"
    :items="targetItems"
    filterable
    empty-text="Nothing to rewind yet"
    @select="chooseTarget"
    @close="() => { if (step === 'pick') emit('close') }"
  />
  <ListPanel
    v-else
    key="action"
    title="Rewind to before"
    :subtitle="targetLabel"
    :items="actionItems"
    :loading="loading"
    :note="note"
    @select="(choice) => void apply(choice)"
    @close="() => { if (!applying) emit('close') }"
  />
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, shallowRef } from 'vue'
import ListPanel, { type ListPanelItem } from './ListPanel.vue'
import { RuntimeKey } from '../../composables/runtimeContext'
import type { Message } from '../../models/Message'
import type { RewindFilesPreview } from '../../core/Session'

const props = defineProps<{
  /** Messages that can be rewound to, newest first */
  targets: Message[]
  /** Start on this message's "what to restore" step (Restore checkpoint) */
  initialTarget?: Message
}>()

const emit = defineEmits<{
  (e: 'close'): void
  /** Conversation rewound: the message goes back into the input */
  (e: 'restored', text: string): void
  (e: 'notify', message: string, severity: 'info' | 'warning' | 'error'): void
}>()

const runtime = inject(RuntimeKey)

const step = ref<'pick' | 'action'>(props.initialTarget ? 'action' : 'pick')
const target = shallowRef<Message | null>(null)
const preview = ref<RewindFilesPreview | null>(null)
const loading = ref(false)
const error = ref('')

/**
 * ListPanel closes itself after every pick, and the panel of the step left
 * behind may report a focusout as it goes: only Esc / clicking away on the
 * current step closes this panel. `applying` covers the pick of a choice.
 */
let applying = false

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

function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function relativeTime(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const targetItems = computed<ListPanelItem[]>(() =>
  props.targets.map((m, i) => ({
    value: String(i),
    label: oneLine(messageText(m)),
    detail: relativeTime(m.timestamp),
  }))
)

const targetLabel = computed(() => (target.value ? oneLine(messageText(target.value), 60) : ''))

function changeSummary(p: RewindFilesPreview): string {
  const files = p.filesChanged?.length ?? 0
  const parts = [`${files} file${files === 1 ? '' : 's'}`]
  if (p.insertions) parts.push(`+${p.insertions}`)
  if (p.deletions) parts.push(`-${p.deletions}`)
  return parts.join(' ')
}

const hasCode = computed(() => !!preview.value?.canRewind && (preview.value.filesChanged?.length ?? 0) > 0)

const actionItems = computed<ListPanelItem[]>(() => {
  const items: ListPanelItem[] = []
  if (hasCode.value) {
    items.push({ value: 'both', label: 'Restore code and conversation', detail: changeSummary(preview.value!) })
  }
  items.push({ value: 'conversation', label: 'Restore conversation' })
  if (hasCode.value) {
    items.push({ value: 'code', label: 'Restore code', detail: changeSummary(preview.value!) })
  }
  items.push({ value: 'cancel', label: 'Never mind' })
  return items
})

const note = computed(() => {
  if (error.value) return error.value
  if (loading.value || !preview.value) return ''
  return hasCode.value
    ? 'Restored files open as diffs to review.'
    : 'No code changes to restore after this message.'
})

function session() {
  return runtime?.sessionStore.activeSession()
}

function chooseTarget(value: string) {
  void openTarget(props.targets[Number(value)])
}

onMounted(() => {
  if (props.initialTarget) void openTarget(props.initialTarget)
})

async function openTarget(chosen: Message | undefined) {
  const s = session()
  if (!chosen?.uuid || !s) return
  target.value = chosen
  preview.value = null
  error.value = ''
  step.value = 'action'
  loading.value = true
  try {
    preview.value = await s.rewindCode(chosen.uuid, true)
  } catch (e) {
    preview.value = { canRewind: false }
    console.warn('[RewindPanel] code preview failed:', e)
  } finally {
    loading.value = false
  }
}

async function apply(choice: string) {
  const chosen = target.value
  const s = session()
  if (choice === 'cancel' || !chosen?.uuid || !s) {
    emit('close')
    return
  }
  applying = true
  loading.value = true
  error.value = ''
  try {
    const restored: string[] = []
    if (choice === 'code' || choice === 'both') {
      const result = await s.rewindCode(chosen.uuid)
      if (!result.canRewind) {
        throw new Error(result.error || 'Could not restore the code')
      }
      restored.push(`code (${changeSummary(result)})`)
    }
    if (choice === 'conversation' || choice === 'both') {
      await s.rewindConversation(chosen)
      restored.push('conversation')
    }
    emit('notify', `Restored ${restored.join(' and ')}`, 'info')
    if (choice !== 'code') {
      emit('restored', messageText(chosen))
    }
    emit('close')
  } catch (e) {
    // Stay open: the error is shown under the choices
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    applying = false
    loading.value = false
  }
}
</script>
