<template>
  <div class="image-block">
    <img
      v-if="imageSrc"
      :src="imageSrc"
      :alt="imageAlt"
      class="image-content"
      @click="open = true"
      @error="handleError"
    />
    <div v-else class="image-placeholder">Image failed to load</div>
    <ImageLightbox :src="open ? imageSrc : null" @close="open = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ImageLightbox from '../../Common/ImageLightbox.vue';
import type { ImageBlock as ImageBlockType } from '../../../models/ContentBlock';

interface Props {
  block: ImageBlockType;
}

const props = defineProps<Props>();

const loadError = ref(false);
const open = ref(false);

const imageSrc = computed(() => {
  if (loadError.value) return null;
  const source = props.block.source;
  if (!source || source.type !== 'base64') return null;
  return `data:${source.media_type};base64,${source.data}`;
});

const imageAlt = computed(() => 'Image');

function handleError() {
  loadError.value = true;
}
</script>

<style scoped>
.image-block {
  margin: 8px 0;
}

.image-content {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  border: 1px solid var(--vscode-panel-border);
  cursor: zoom-in;
}

.image-placeholder {
  padding: 32px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  background-color: var(--vscode-editor-background);
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 4px;
}
</style>
