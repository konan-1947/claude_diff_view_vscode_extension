<template>
  <Tooltip :content="tooltipText" side="top" :side-offset="6">
    <div class="progress-container" :class="`level-${level}`">
      <span class="progress-text">{{ formattedPercentage }}</span>
      <svg class="progress-svg" :width="BOX" :height="BOX" :viewBox="`0 0 ${BOX} ${BOX}`">
        <circle
          class="progress-track"
          :cx="BOX / 2"
          :cy="BOX / 2"
          :r="RADIUS"
          fill="none"
          :stroke-width="STROKE"
        />
        <circle
          class="progress-arc"
          :cx="BOX / 2"
          :cy="BOX / 2"
          :r="RADIUS"
          fill="none"
          :stroke-width="STROKE"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeOffset"
          :transform="`rotate(-90 ${BOX / 2} ${BOX / 2})`"
        />
      </svg>
    </div>
  </Tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from './Common/Tooltip.vue'

interface Props {
  percentage: number
  contextTooltip?: string
}

const props = withDefaults(defineProps<Props>(), {
  percentage: 0,
  contextTooltip: ''
})

// Same 20px box as the neighbouring action buttons; the ring sits inside it
// at the 16px icon size so the row reads as one even rhythm.
const BOX = 20
const STROKE = 2
const RADIUS = (16 - STROKE) / 2

const circumference = 2 * Math.PI * RADIUS

const clamped = computed(() => Math.max(0, Math.min(100, props.percentage || 0)))

const strokeOffset = computed(() => circumference - (clamped.value / 100) * circumference)

// Whole numbers only: a jittering decimal is noise at this size.
// A little usage should not read as "0%".
const formattedPercentage = computed(() => {
  const v = clamped.value
  if (v > 0 && v < 1) return '<1%'
  return `${Math.round(v)}%`
})

// Neutral until the window is getting tight (CLI auto-compacts near the end)
const level = computed(() => (clamped.value >= 90 ? 'critical' : clamped.value >= 75 ? 'warn' : 'normal'))

const tooltipText = computed(() =>
  props.contextTooltip ? `${formattedPercentage.value} · ${props.contextTooltip}` : formattedPercentage.value
)
</script>

<style scoped>
.progress-container {
  --ring: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  display: flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  margin-right: 2px;
  cursor: default;
  position: relative;
  z-index: 100;
}

.progress-container.level-warn {
  --ring: var(--vscode-editorWarning-foreground, #cca700);
}

.progress-container.level-critical {
  --ring: var(--vscode-editorError-foreground, #f14c4c);
}

.progress-text {
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
}

.level-warn .progress-text,
.level-critical .progress-text {
  color: var(--ring);
}

.progress-svg {
  display: block;
  flex-shrink: 0;
}

.progress-track {
  stroke: var(--ring);
  opacity: 0.2;
}

.progress-arc {
  stroke: var(--ring);
  transition: stroke-dashoffset 0.3s ease, stroke 0.2s ease;
}
</style>
