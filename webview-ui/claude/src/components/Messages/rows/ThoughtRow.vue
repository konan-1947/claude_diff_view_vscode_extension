<template>
  <div class="cs-step-row">
    <button
      type="button"
      class="cs-step"
      :class="{ open: open && hasText }"
      :aria-expanded="hasText ? open : undefined"
      :disabled="!hasText"
      @click="open = !open"
    >
      <span class="cs-step__action">Thought</span>
      <span v-if="detail" class="cs-step__details">{{ detail }}</span>
      <span v-if="hasText" class="codicon codicon-chevron-down cs-step__chevron" />
    </button>
    <div v-if="open && hasText" class="thought-text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ text: string }>();
// Starts open (shown with the turn's steps; Ctrl+O folds the turn), a click closes it
const open = ref(true);

// Blocks from sessions whose thinking display was "omitted" (older history, or
// a redacted block) carry no text: nothing to expand, and "briefly" would be a guess
const hasText = computed(() => props.text.trim().length > 0);
// The SDK does not report how long the model thought, so only flag trivial ones
const detail = computed(() => (hasText.value && props.text.trim().length < 160 ? 'briefly' : ''));
</script>

<style scoped>
.thought-text {
  margin-top: var(--cs-row-gap);
  font-size: var(--cs-font-size);
  line-height: var(--cs-line-height);
  color: var(--cs-fg);
  white-space: pre-wrap;
  word-wrap: break-word;
  user-select: text;
  max-height: 320px;
  overflow-y: auto;
}
</style>
