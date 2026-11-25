<template>
  <div class="user-message">
    <div class="message-wrapper">
      <!-- Not editable in place, like the CLI: an earlier prompt is changed with
           Esc Esc / /rewind (the message comes back to the input) -->
      <div class="message-content">
        <div class="message-view">
          <div class="message-text">
            <div>
              <div v-if="images.length" class="message-images">
                <button
                  v-for="(img, i) in images"
                  :key="i"
                  class="message-image"
                  :aria-label="`View image ${i + 1}`"
                  @click.stop="preview = img"
                >
                  <img :src="img" :alt="`Image ${i + 1}`" />
                </button>
              </div>
              <div v-if="displayContent.trim()" class="message-body">{{ displayContent }}</div>
            </div>
            <div class="message-actions">
              <Tooltip :content="copied ? 'Copied' : 'Copy message'">
                <button class="restore-button" :class="{ copied }" @click.stop="copy">
                  <span class="codicon" :class="copied ? 'codicon-check' : 'codicon-copy'"></span>
                </button>
              </Tooltip>
              <Tooltip v-if="canRestore" content="Restore checkpoint">
                <button
                  class="restore-button"
                  @click.stop="handleRestore"
                >
                  <span class="codicon codicon-restore"></span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ImageLightbox :src="preview" @close="preview = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { RestoreCheckpointKey } from '../../composables/runtimeContext';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import Tooltip from '../Common/Tooltip.vue';
import ImageLightbox from '../Common/ImageLightbox.vue';
import { userMessageText } from '../../utils/userText';

interface Props {
  message: Message;
  context: ToolContext;
}

const props = defineProps<Props>();

// Display content (plain text)
const displayContent = computed(() => userMessageText(props.message));

// Images the user attached (data: URLs), shown as thumbnails above the text
const images = computed(() => {
  const content = props.message.message.content;
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const wrapper of content) {
    const block = wrapper.content;
    if (block.type === 'image' && block.source?.type === 'base64' && block.source.data) {
      out.push(`data:${block.source.media_type};base64,${block.source.data}`);
    }
  }
  return out;
});

/** Image open in the full-size popup */
const preview = ref<string | null>(null);

// Copy the prompt (same fallback as the copy button under Claude's reply)
const copied = ref(false);
async function copy() {
  const text = displayContent.value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

// Rewind needs the message's transcript id; ChatPage provides the opener
const restoreCheckpoint = inject(RestoreCheckpointKey, undefined);
const canRestore = computed(() => !!restoreCheckpoint && !!props.message.uuid);

/** Same as Esc Esc on this message: Rewind opens on its "what to restore" step */
function handleRestore() {
  restoreCheckpoint?.(props.message);
}
</script>

<style scoped>
.user-message {
  display: block;
  outline: none;
  padding: 0 var(--cs-edge);
  opacity: 1;
}

.message-wrapper {
  background-color: transparent;
}

/* The frame is the bubble itself (see .message-text); the outer box stays invisible */
.message-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  background-color: transparent;
  outline: none;
  border: none;
  border-radius: 12px;
  position: relative;
}

/* Normal display mode */
.message-view {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
}

.message-view .message-text {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--cs-fg-20);
  outline: none;
  border-radius: 12px;
  /* Right-aligned and as wide as its content, like a chat bubble */
  max-width: 85%;
  padding: 8px 10px;
  box-sizing: border-box;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.message-view .message-text:hover {
  background-color: var(--vscode-editor-background);
  border-color: var(--cs-fg-36);
}

.message-text > div:first-child {
  min-width: 0;
  height: min-content;
  max-height: 120px;
  overflow: hidden;
  line-height: 22px;
  font-family: inherit;
  font-size: 14px;
  color: var(--vscode-foreground);
  background-color: transparent;
  outline: none;
  border: none;
  overflow-wrap: break-word;
  word-break: break-word;
  padding: 0;
  user-select: text;
  white-space: pre-wrap;
  flex: 1;
}

/* The 120px clamp applies to the text only, so thumbnails do not eat into it */
.message-text > div:first-child:has(.message-images) {
  max-height: none;
}

.message-text > div:first-child:has(.message-images) .message-body {
  max-height: 120px;
  overflow: hidden;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.message-images:last-child {
  margin-bottom: 0;
}

.message-image {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--cs-fg-20);
  border-radius: 6px;
  overflow: hidden;
  cursor: zoom-in;
  background: transparent;
}

.message-image:hover {
  border-color: var(--vscode-focusBorder);
}

.message-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* copy / restore checkpoint buttons, shown on hover */
.message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
  flex-shrink: 0;
}

.restore-button {
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  display: flex;
  width: 20px;
  align-items: center;
  justify-content: center;
  line-height: 17px;
  padding: 0 2px;
  height: 20px;
  box-sizing: border-box;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: background-color 0.1s ease, opacity 0.15s ease;
}

.message-text:hover .restore-button,
.restore-button:focus-visible,
.restore-button.copied {
  opacity: 1;
}

.restore-button:hover {
  background-color: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
}

.restore-button .codicon {
  font-size: 12px;
  color: var(--vscode-foreground);
}
</style>
