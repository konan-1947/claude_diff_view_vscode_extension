<template>
  <!-- Prompt of the turn at the top of the transcript, pinned while its own
       bubble is scrolled out of view (as in the Claude Code TUI), shown only
       while the transcript is being scrolled. Drawn over the transcript, so
       showing / hiding it never moves a row. Same box as the real bubble
       (left edge and width measured from it by ChatPage), cut to one line.
       Fades in and out; the next prompt taking over cross-fades (keyed by turn). -->
  <Transition name="sticky-fade">
    <div
      v-if="visible"
      :key="turnKey"
      class="sticky-prompt"
      :style="{ left: `${left}px`, width: `${width}px`, transform: shift ? `translateY(${shift}px)` : undefined }"
    >
      <button
        type="button"
        class="sticky-prompt__bubble"
        title="Scroll to this message"
        @click="emit('jump')"
        @mouseenter="emit('hover', true)"
        @mouseleave="emit('hover', false)"
      >
        <span class="sticky-prompt__text">{{ text }}</span>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; turnKey: number; text: string; left: number; width: number; shift: number }>();
const emit = defineEmits<{ jump: []; hover: [boolean] }>();

</script>

<style scoped>
.sticky-prompt {
  position: absolute;
  top: 2px;
  z-index: 5;
  pointer-events: none;
  display: flex;
  justify-content: center;
}

/* Same box as .message-text in UserMessage.vue */
.sticky-prompt__bubble {
  pointer-events: auto;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  box-sizing: border-box;
  overflow: hidden;
  text-align: left;
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--vscode-foreground);
  cursor: pointer;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--cs-fg-20);
  border-radius: 12px;
  box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.35);
  transition: border-color 0.15s ease;
}

.sticky-prompt__bubble:hover {
  border-color: var(--cs-fg-36);
}

.sticky-fade-enter-active,
.sticky-fade-leave-active {
  transition: opacity 0.18s ease;
}

.sticky-fade-enter-from,
.sticky-fade-leave-to {
  opacity: 0;
}

.sticky-prompt__text {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
