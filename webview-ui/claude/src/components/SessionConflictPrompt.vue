<template>
  <!-- The conversation picked (`/resume`, history, Continue) is already open in
       another tab. Two CLI processes writing one transcript would interleave
       their messages, so this tab either hands over to that tab or continues
       in a fork (same history, new session id). -->
  <PromptFrame title="Already open in another tab" :hint="['↑/↓ or number to select', 'Enter to confirm', 'Esc to cancel']">
    <div class="sc-text">
      <span class="sc-name">{{ name }}</span> is open in
      <span class="sc-name">{{ ownerTitle }}</span>. Two tabs would write to the same conversation.
    </div>
    <PromptOptions :options="options" @pick="onPick" @cancel="emit('cancel')" />
  </PromptFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PromptFrame from './Permission/PromptFrame.vue'
import PromptOptions, { type PromptOption } from './Permission/PromptOptions.vue'

const props = defineProps<{
  /** Title of the conversation */
  summary?: string
  ownerTitle?: string
}>()

const emit = defineEmits<{
  (e: 'focus-owner'): void
  (e: 'fork'): void
  (e: 'cancel'): void
}>()

const name = computed(() => (props.summary?.trim() ? `"${props.summary.trim()}"` : 'This conversation'))
const ownerTitle = computed(() => (props.ownerTitle?.trim() ? `tab "${props.ownerTitle.trim()}"` : 'another tab'))

const options: PromptOption[] = [
  { label: 'Switch to that tab' },
  { label: 'Open a fork here', detail: 'Same history, continues as a new conversation' },
  { label: 'Cancel' },
]

function onPick(index: number) {
  if (index === 0) emit('focus-owner')
  else if (index === 1) emit('fork')
  else emit('cancel')
}
</script>

<style scoped>
.sc-text {
  color: var(--cs-fg-74);
  overflow-wrap: anywhere;
}

.sc-name {
  color: var(--cs-fg);
}
</style>
