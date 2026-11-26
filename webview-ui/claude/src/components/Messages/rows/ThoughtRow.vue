<template>
  <div class="cs-step-row">
    <button type="button" class="cs-step" :class="{ open }" :aria-expanded="open" @click="open = !open">
      <span class="cs-step__action">Thought</span>
      <span v-if="detail" class="cs-step__details">{{ detail }}</span>
      <span class="codicon codicon-chevron-down cs-step__chevron" />
    </button>
    <div v-if="open" class="thought-text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ text: string }>();
// Starts closed, also with Ctrl+O's step list shown: a click opens it
const open = ref(false);

// The SDK does not report how long the model thought, so only flag trivial ones
const detail = computed(() => (props.text.trim().length < 160 ? 'briefly' : ''));
</script>

<style scoped>
.thought-text {
  margin-top: var(--cs-row-gap);
  font-size: var(--cs-font-size);
  line-height: var(--cs-line-height);
  color: var(--cs-fg-52);
  white-space: pre-wrap;
  word-wrap: break-word;
  user-select: text;
  max-height: 320px;
  overflow-y: auto;
}
</style>
