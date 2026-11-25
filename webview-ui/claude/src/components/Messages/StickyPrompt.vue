<template>
  <!-- Prompt of the turn at the top of the transcript, pinned while its own
       bubble is scrolled out of view (as in the Claude Code TUI). Drawn over
       the transcript, so showing / hiding it never moves a row. -->
  <div class="sticky-prompt">
    <button type="button" class="sticky-prompt__bubble" title="Scroll to this message" @click="emit('jump')">
      <span class="sticky-prompt__text">{{ text }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ text: string }>();
const emit = defineEmits<{ jump: [] }>();
</script>

<style scoped>
.sticky-prompt {
  position: absolute;
  top: 0;
  left: 0;
  /* Leave the transcript's scrollbar uncovered */
  right: 6px;
  z-index: 5;
  max-width: var(--cs-column-max);
  margin-inline: auto;
  padding: 6px var(--cs-edge) 0;
  box-sizing: border-box;
  pointer-events: none;
}

.sticky-prompt__bubble {
  pointer-events: auto;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  box-sizing: border-box;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--cs-fg-20);
  border-radius: 12px;
  box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.35);
}

.sticky-prompt__bubble:hover {
  border-color: var(--cs-fg-36);
}

.sticky-prompt__text {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
