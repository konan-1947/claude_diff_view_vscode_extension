<template>
  <TooltipProvider :delay-duration="delayDuration" :disable-hoverable-content="true">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="cursor-tooltip-content"
          :side="side"
          :side-offset="sideOffset"
          :align="align"
        >
          <slot name="content">{{ content }}</slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup lang="ts">
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
} from 'reka-ui'

withDefaults(defineProps<{
  content?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
}>(), {
  content: '',
  side: 'top',
  sideOffset: 7,
  align: 'center',
  delayDuration: 400,
})
</script>

<style>
/* Tooltip styles are NOT scoped — rendered via Portal outside component DOM */

.cursor-tooltip-content {
  --_tooltip-bg: var(--cursor-bg-elevated);
  --_tooltip-border: var(--cursor-stroke-primary);

  position: relative;
  background-color: var(--_tooltip-bg);
  color: var(--cursor-text-primary);
  border: 1px solid var(--_tooltip-border);
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 11px;
  line-height: 1.4;
  max-width: 280px;
  word-wrap: break-word;
  z-index: 10000;
  box-shadow: var(--cursor-shadow-hover-tooltip);
  animation: cursor-tooltip-fade-in 0.12s ease-out;
  user-select: none;
}

/* CSS rotated-square arrow — border flows through body → arrow seamlessly */
.cursor-tooltip-content::after {
  content: '';
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--_tooltip-bg);
}

/* Top: tooltip above → arrow points down */
.cursor-tooltip-content[data-side="top"]::after {
  bottom: -4.5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid var(--_tooltip-border);
  border-bottom: 1px solid var(--_tooltip-border);
}

/* Bottom: tooltip below → arrow points up */
.cursor-tooltip-content[data-side="bottom"]::after {
  top: -4.5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  border-left: 1px solid var(--_tooltip-border);
  border-top: 1px solid var(--_tooltip-border);
}

/* Left: tooltip left → arrow points right */
.cursor-tooltip-content[data-side="left"]::after {
  right: -4.5px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
  border-top: 1px solid var(--_tooltip-border);
  border-right: 1px solid var(--_tooltip-border);
}

/* Right: tooltip right → arrow points left */
.cursor-tooltip-content[data-side="right"]::after {
  left: -4.5px;
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
  border-bottom: 1px solid var(--_tooltip-border);
  border-left: 1px solid var(--_tooltip-border);
}

@keyframes cursor-tooltip-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
