<template>
  <Teleport to="body">
    <div
      v-if="src"
      class="image-lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="alt || 'Image preview'"
      @click.self="emit('close')"
    >
      <button class="lightbox-close" aria-label="Close" @click="emit('close')">
        <span class="codicon codicon-close" />
      </button>
      <img :src="src" :alt="alt || 'Image'" class="lightbox-image" />
      <div v-if="alt" class="lightbox-caption">{{ alt }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';

const props = defineProps<{ src: string | null; alt?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

// Esc closes the popup; capture phase so the chat's own Esc handling (interrupt / rewind)
// does not also fire while the image is open.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
}

watch(
  () => props.src,
  (src) => {
    if (src) window.addEventListener('keydown', onKeydown, true);
    else window.removeEventListener('keydown', onKeydown, true);
  },
  { immediate: true }
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));
</script>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 24px 24px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--vscode-editor-background) 25%, rgba(0, 0, 0, 0.75));
}

.lightbox-image {
  max-width: 100%;
  max-height: calc(100% - 28px);
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  background: var(--vscode-editor-background);
}

.lightbox-caption {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #fff;
  opacity: 0.85;
}

.lightbox-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgba(0, 0, 0, 0.7);
}

.lightbox-close .codicon {
  font-size: 16px;
}
</style>
