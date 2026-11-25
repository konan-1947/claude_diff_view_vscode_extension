<template>
  <!-- The CLI's "Resume this conversation?": the prompt cache has expired, so
       the next message re-sends the whole context, which costs a noticeable
       share of the 5-hour usage limit. The typed message stays in the input. -->
  <PromptFrame title="Resume this conversation?" :hint="['↑/↓ or number to select', 'Enter to confirm', 'Esc to dismiss']">
    <div class="cr-text">
      This conversation has been inactive for {{ inactive }} and is {{ tokens }} tokens long.
      <template v-if="info.percent >= 100">
        Resuming it will use <span class="cr-strong">all</span> of your 5-hour usage limit.
      </template>
      <template v-else>
        Resuming it will use about <span class="cr-strong">{{ info.percent }}%</span> of your 5-hour usage limit.
      </template>
    </div>
    <div class="cr-note">Your unsent message will still be there after you answer.</div>
    <PromptOptions :options="options" @pick="onPick" @cancel="emit('dismiss')" />
  </PromptFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PromptFrame from './Permission/PromptFrame.vue'
import PromptOptions, { type PromptOption } from './Permission/PromptOptions.vue'
import { formatTokenCount } from '../core/LiveActivity'
import type { ColdResumeInfo } from '../core/Session'

const props = defineProps<{ info: ColdResumeInfo }>()

const emit = defineEmits<{
  (e: 'resume'): void
  (e: 'new-conversation'): void
  (e: 'dismiss'): void
}>()

const inactive = computed(() => {
  const minutes = Math.max(1, Math.round((Date.now() - props.info.inactiveSince) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
})

const tokens = computed(() => formatTokenCount(props.info.contextTokens))

const options: PromptOption[] = [
  { label: 'Resume' },
  { label: 'Start a new conversation' },
]

function onPick(index: number) {
  if (index === 0) emit('resume')
  else emit('new-conversation')
}
</script>

<style scoped>
.cr-text {
  color: var(--cs-fg-74);
  overflow-wrap: anywhere;
}

.cr-strong {
  color: var(--cs-fg);
  font-weight: 600;
}

.cr-note {
  color: var(--cs-fg-54, var(--cs-fg-74));
}
</style>
