<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="image-lightbox"
      @pointerdown.self="backdropDown = true"
      @click.self="onBackdropClick"
    >
      <div class="lightbox-panel" role="dialog" aria-modal="true" :aria-label="title">
        <div class="lightbox-bar">
          <strong class="lightbox-title" :title="title">{{ title }}</strong>
          <span class="lightbox-hint">Scroll to zoom   Drag to pan   Double-click to fit / 100%</span>
          <button class="lightbox-btn" title="Zoom out (-)" aria-label="Zoom out" @click="zoomCenter(1 / STEP)">
            <span class="codicon codicon-zoom-out" />
          </button>
          <span class="lightbox-percent">{{ Math.round(scale * 100) }}%</span>
          <button class="lightbox-btn" title="Zoom in (+)" aria-label="Zoom in" @click="zoomCenter(STEP)">
            <span class="codicon codicon-zoom-in" />
          </button>
          <button class="lightbox-btn lightbox-text-btn" title="Fit to window (0)" @click="fit">Fit</button>
          <button class="lightbox-btn lightbox-text-btn" title="Actual size (1)" @click="actual">100%</button>
          <button class="lightbox-btn" title="Close (Esc)" aria-label="Close" @click="emit('close')">
            <span class="codicon codicon-close" />
          </button>
        </div>
        <div
          ref="stageRef"
          class="lightbox-stage"
          :class="{ dragging: !!drag }"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @dblclick="toggleFit"
        >
          <div class="lightbox-content" :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }">
            <div v-if="svg" ref="svgHostRef" class="lightbox-svg" v-html="svg"></div>
            <img
              v-else-if="src"
              :src="src"
              :alt="alt || 'Image'"
              :width="natural?.width"
              :height="natural?.height"
              draggable="false"
              class="lightbox-image"
              @load="onImageLoad"
              @error="failed = true"
            />
            <div v-if="failed" class="lightbox-error">Could not display this image</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Image / diagram viewer with zoom and pan, the same controls as the file
 * preview's viewer (res/webview/preview/zoom.js): wheel zooms around the
 * pointer, drag pans, double-click toggles fit / 100%, + - 0 1 Esc keys.
 * Pass `src` for an image URL, or `svg` for SVG markup (a rendered mermaid diagram).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ src?: string | null; svg?: string | null; alt?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const STEP = 1.25;
const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const PAD = 24;

const open = computed(() => !!(props.src || props.svg));
const title = computed(() => props.alt || (props.svg ? 'Mermaid diagram' : 'Image'));

const stageRef = ref<HTMLElement>();
const svgHostRef = ref<HTMLElement>();
const natural = ref<{ width: number; height: number }>();
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const failed = ref(false);
const drag = ref<{ x: number; y: number; tx: number; ty: number }>();
// Only a click that also started on the dimmed backdrop closes: a pan released outside the panel must not
const backdropDown = ref(false);

function onBackdropClick() {
  if (backdropDown.value) emit('close');
  backdropDown.value = false;
}

function stageSize() {
  const rect = stageRef.value?.getBoundingClientRect();
  return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
}

function fit() {
  if (!natural.value) return;
  const area = stageSize();
  let next = Math.min((area.width - PAD) / natural.value.width, (area.height - PAD) / natural.value.height);
  // A raster image is never blown up past its own pixels by Fit; an SVG stays sharp, so it may be
  next = Math.max(MIN_SCALE, Math.min(next, props.svg ? MAX_SCALE : 1));
  scale.value = next;
  tx.value = (area.width - natural.value.width * next) / 2;
  ty.value = (area.height - natural.value.height * next) / 2;
}

/** Keeps the point under (cx, cy) fixed while the scale changes */
function zoomAt(factor: number, cx: number, cy: number) {
  if (!natural.value) return;
  const next = Math.max(MIN_SCALE, Math.min(scale.value * factor, MAX_SCALE));
  const ratio = next / scale.value;
  tx.value = cx - (cx - tx.value) * ratio;
  ty.value = cy - (cy - ty.value) * ratio;
  scale.value = next;
}

function zoomCenter(factor: number) {
  const area = stageSize();
  zoomAt(factor, area.width / 2, area.height / 2);
}

function actual() {
  zoomCenter(1 / scale.value);
}

function toggleFit() {
  if (Math.abs(scale.value - 1) < 0.01) fit();
  else actual();
}

function onWheel(event: WheelEvent) {
  const rect = stageRef.value!.getBoundingClientRect();
  zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX - rect.left, event.clientY - rect.top);
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  drag.value = { x: event.clientX, y: event.clientY, tx: tx.value, ty: ty.value };
  stageRef.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!drag.value) return;
  tx.value = drag.value.tx + event.clientX - drag.value.x;
  ty.value = drag.value.ty + event.clientY - drag.value.y;
}

function endDrag() {
  drag.value = undefined;
}

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement;
  natural.value = { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
  void nextTick(fit);
}

/** Mermaid's <svg> is width="100%" with a max-width style: give it its intrinsic size from the viewBox */
function prepareSvg() {
  const svg = svgHostRef.value?.querySelector('svg');
  if (!svg) {
    failed.value = true;
    return;
  }
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  let width = vb.length === 4 ? vb[2] : parseFloat(svg.getAttribute('width') || '');
  let height = vb.length === 4 ? vb[3] : parseFloat(svg.getAttribute('height') || '');
  if (!(width > 0) || !(height > 0)) {
    const box = svg.getBoundingClientRect();
    width = box.width || 800;
    height = box.height || 600;
  }
  svg.removeAttribute('style');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.display = 'block';
  natural.value = { width, height };
  fit();
}

// Capture phase so the chat's own keys (Esc interrupts / rewinds) do not also fire while it is open
function onKeydown(event: KeyboardEvent) {
  const handled = (fn: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    fn();
  };
  if (event.key === 'Escape') handled(() => emit('close'));
  else if (event.key === '+' || event.key === '=') handled(() => zoomCenter(STEP));
  else if (event.key === '-') handled(() => zoomCenter(1 / STEP));
  else if (event.key === '0') handled(fit);
  else if (event.key === '1') handled(actual);
}

function onResize() {
  fit();
}

function detach() {
  window.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', onResize);
}

watch(
  () => [props.src, props.svg] as const,
  ([src, svg]) => {
    natural.value = undefined;
    failed.value = false;
    drag.value = undefined;
    backdropDown.value = false;
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    detach();
    if (!src && !svg) return;
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', onResize);
    if (svg) void nextTick(prepareSvg);
  },
  { immediate: true }
);

onBeforeUnmount(detach);
</script>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.lightbox-panel {
  display: flex;
  flex-direction: column;
  width: 80vw;
  height: 80vh;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border, var(--cs-fg-12));
  border-radius: 8px;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-size: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}

.lightbox-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border, var(--cs-fg-12));
  background: var(--vscode-sideBar-background, var(--cs-fg-12));
}

.lightbox-title {
  max-width: 40%;
  margin-right: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-hint {
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  opacity: 0.6;
}

.lightbox-percent {
  min-width: 44px;
  text-align: center;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

.lightbox-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 28px;
  padding: 0 6px;
  border: 1px solid var(--vscode-panel-border, var(--cs-fg-12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.lightbox-text-btn {
  padding: 0 8px;
}

.lightbox-btn:hover {
  background: var(--vscode-toolbar-hoverBackground, var(--cs-fg-12));
}

.lightbox-btn .codicon {
  font-size: 14px;
}

.lightbox-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.lightbox-stage.dragging {
  cursor: grabbing;
}

.lightbox-content {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}

.lightbox-image {
  display: block;
  max-width: none;
  max-height: none;
}

.lightbox-error {
  padding: 16px;
  opacity: 0.75;
  white-space: nowrap;
}
</style>
