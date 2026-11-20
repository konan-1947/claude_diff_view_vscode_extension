<template>
  <div
    ref="scrollableContainer"
    class="monaco-scrollable-element"
    role="presentation"
    @wheel="handleWheel"
    @mouseenter="showScrollbars"
    @mouseleave="hideScrollbars"
  >
    <!-- Content container -->
    <div
      ref="contentWrapper"
      class="scrollable-content-wrapper"
      :style="contentWrapperStyle"
    >
      <div
        ref="contentContainer"
        class="scrollable-content-container"
        :class="{ smooth: smooth }"
        :style="contentContainerStyle"
      >
        <slot></slot>
      </div>
    </div>

    <!-- Vertical scrollbar -->
    <div
      v-show="showVerticalScrollbar"
      ref="verticalScrollbar"
      class="scrollbar vertical"
      :class="scrollbarClasses"
      role="presentation"
      aria-hidden="true"
      :style="verticalScrollbarStyle"
      @mousedown="startVerticalDrag"
    >
      <div
        ref="verticalSlider"
        class="slider"
        :style="verticalSliderStyle"
      ></div>
    </div>

    <!-- Horizontal scrollbar -->
    <div
      v-show="showHorizontalScrollbar"
      ref="horizontalScrollbar"
      class="scrollbar horizontal"
      :class="scrollbarClasses"
      role="presentation"
      aria-hidden="true"
      :style="horizontalScrollbarStyle"
      @mousedown="startHorizontalDrag"
    >
      <div
        ref="horizontalSlider"
        class="slider"
        :style="horizontalSliderStyle"
      ></div>
    </div>

    <!-- Shadow effect -->
    <div v-show="scrollTop > 0" class="shadow top"></div>
    <div v-show="scrollTop > 0" class="shadow top-left-corner top"></div>
    <div v-show="!isScrolledToBottom" class="shadow"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, type CSSProperties } from 'vue'

interface Props {
  height?: string | number
  width?: string | number
  horizontalScroll?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  height: '100%',
  width: '100%',
  horizontalScroll: true
})

// DOM refs
const scrollableContainer = ref<HTMLElement>()
const contentWrapper = ref<HTMLElement>()
const contentContainer = ref<HTMLElement>()
const verticalScrollbar = ref<HTMLElement>()
const verticalSlider = ref<HTMLElement>()
const horizontalScrollbar = ref<HTMLElement>()
const horizontalSlider = ref<HTMLElement>()

// Scroll state
const scrollTop = ref(0)
const scrollLeft = ref(0)
const scrollHeight = ref(0)
const scrollWidth = ref(0)
const clientHeight = ref(0)
const clientWidth = ref(0)
const isScrollbarVisible = ref(false)
const scrollbarFadeTimer = ref<number>()
const smooth = ref(false)
const smoothOffTimer = ref<number>()

// Drag state
const isDragging = ref(false)
const dragType = ref<'vertical' | 'horizontal' | null>(null)
const dragStartPos = ref(0)
const dragStartScroll = ref(0)

// Computed properties
const showVerticalScrollbar = computed(() => scrollHeight.value > clientHeight.value)
const showHorizontalScrollbar = computed(() => props.horizontalScroll && scrollWidth.value > clientWidth.value)

const isScrolledToBottom = computed(() => {
  return scrollTop.value >= scrollHeight.value - clientHeight.value - 1
})

const scrollbarClasses = computed(() => ({
  invisible: !isScrollbarVisible.value,
  fade: true,
  visible: isScrollbarVisible.value
}))

const contentWrapperStyle = computed((): CSSProperties => ({
  width: '100%',
  overflow: 'hidden',
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  position: 'relative'
}))

const contentContainerStyle = computed((): CSSProperties => ({
  display: 'inline-block',
  position: 'relative',
  width: '100%',
  minHeight: '100%',
  transform: `translate3d(${-scrollLeft.value}px, ${-scrollTop.value}px, 0px)`,
  zIndex: 0,
  boxSizing: 'border-box'
}))

const verticalScrollbarStyle = computed((): CSSProperties => ({
  position: 'absolute',
  width: '6px',
  height: `${clientHeight.value}px`,
  right: '0px',
  top: '0px'
}))

const verticalSliderStyle = computed((): CSSProperties => {
  const ratio = clientHeight.value / scrollHeight.value
  const sliderHeight = Math.max(clientHeight.value * ratio, 20)
  const sliderTop = (scrollTop.value / (scrollHeight.value - clientHeight.value)) * (clientHeight.value - sliderHeight)

  return {
    position: 'absolute',
    top: `${sliderTop}px`,
    left: '0px',
    width: '6px',
    height: `${sliderHeight}px`,
    transform: 'translate3d(0px, 0px, 0px)'
  }
})

const horizontalScrollbarStyle = computed((): CSSProperties => ({
  position: 'absolute',
  width: `${clientWidth.value}px`,
  height: '10px',
  left: '0px',
  bottom: '0px'
}))

const horizontalSliderStyle = computed((): CSSProperties => {
  const ratio = clientWidth.value / scrollWidth.value
  const sliderWidth = Math.max(clientWidth.value * ratio, 20)
  const sliderLeft = (scrollLeft.value / (scrollWidth.value - clientWidth.value)) * (clientWidth.value - sliderWidth)

  return {
    position: 'absolute',
    top: '0px',
    left: `${sliderLeft}px`,
    height: '10px',
    width: `${sliderWidth}px`,
    transform: 'translate3d(0px, 0px, 0px)'
  }
})

// Update size info
const updateDimensions = () => {
  if (!contentWrapper.value || !contentContainer.value) return

  const wrapperRect = contentWrapper.value.getBoundingClientRect()
  clientHeight.value = wrapperRect.height
  clientWidth.value = wrapperRect.width

  // Get the actual content size, taking children into account
  let actualHeight = contentContainer.value.scrollHeight
  let actualWidth = contentContainer.value.scrollWidth

  // If the container has children, check their sizes
  const children = contentContainer.value.children
  if (children.length > 0) {
    let maxHeight = 0
    let maxWidth = 0

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      const childRect = child.getBoundingClientRect()
      const containerRect = contentContainer.value.getBoundingClientRect()

      // Compute the child's position relative to the container
      const childBottom = childRect.bottom - containerRect.top
      const childRight = childRect.right - containerRect.left

      maxHeight = Math.max(maxHeight, childBottom)
      maxWidth = Math.max(maxWidth, childRight)
    }

    actualHeight = Math.max(actualHeight, maxHeight)
    actualWidth = Math.max(actualWidth, maxWidth)
  }

  scrollHeight.value = actualHeight
  scrollWidth.value = actualWidth
}

// Show the scrollbars
const showScrollbars = () => {
  isScrollbarVisible.value = true

  if (scrollbarFadeTimer.value) {
    clearTimeout(scrollbarFadeTimer.value)
  }

  if (smoothOffTimer.value) {
    clearTimeout(smoothOffTimer.value)
  }
}

// Hide the scrollbars
const hideScrollbars = () => {
  if (!isDragging.value) {
    scrollbarFadeTimer.value = window.setTimeout(() => {
      isScrollbarVisible.value = false
    }, 800)
  }
}

// Wheel handling
const handleWheel = (event: WheelEvent) => {
  event.preventDefault()

  const deltaY = event.deltaY
  const deltaX = event.deltaX

  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    // Vertical scroll
    const newScrollTop = Math.max(0, Math.min(scrollHeight.value - clientHeight.value, scrollTop.value + deltaY))
    scrollTop.value = newScrollTop
  } else {
    // Horizontal scroll
    const newScrollLeft = Math.max(0, Math.min(scrollWidth.value - clientWidth.value, scrollLeft.value + deltaX))
    scrollLeft.value = newScrollLeft
  }

  // User wheel scroll: enable a brief smooth transition
  smooth.value = true
  if (smoothOffTimer.value) {
    clearTimeout(smoothOffTimer.value)
  }
  smoothOffTimer.value = window.setTimeout(() => {
    smooth.value = false
  }, 120)

  showScrollbars()
}

// Vertical drag
const startVerticalDrag = (event: MouseEvent) => {
  event.preventDefault()
  isDragging.value = true
  dragType.value = 'vertical'
  dragStartPos.value = event.clientY
  dragStartScroll.value = scrollTop.value
  smooth.value = true

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', endDrag)
}

// Horizontal drag
const startHorizontalDrag = (event: MouseEvent) => {
  event.preventDefault()
  isDragging.value = true
  dragType.value = 'horizontal'
  dragStartPos.value = event.clientX
  dragStartScroll.value = scrollLeft.value
  smooth.value = true

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', endDrag)
}

// Handle dragging
const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return

  if (dragType.value === 'vertical') {
    const deltaY = event.clientY - dragStartPos.value
    const ratio = deltaY / (clientHeight.value - (clientHeight.value * clientHeight.value / scrollHeight.value))
    const newScrollTop = Math.max(0, Math.min(scrollHeight.value - clientHeight.value, dragStartScroll.value + ratio * (scrollHeight.value - clientHeight.value)))
    scrollTop.value = newScrollTop
  } else if (dragType.value === 'horizontal') {
    const deltaX = event.clientX - dragStartPos.value
    const ratio = deltaX / (clientWidth.value - (clientWidth.value * clientWidth.value / scrollWidth.value))
    const newScrollLeft = Math.max(0, Math.min(scrollWidth.value - clientWidth.value, dragStartScroll.value + ratio * (scrollWidth.value - clientWidth.value)))
    scrollLeft.value = newScrollLeft
  }
}

// End dragging
const endDrag = () => {
  isDragging.value = false
  dragType.value = null

  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', endDrag)

  hideScrollbars()
  smooth.value = false
}

// Watch container size changes
const resizeObserver = new ResizeObserver(() => {
  nextTick(() => {
    updateDimensions()
  })
})

// Create the mutationObserver ref during the synchronous setup phase
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  if (scrollableContainer.value) {
    resizeObserver.observe(scrollableContainer.value)
  }

  if (contentContainer.value) {
    resizeObserver.observe(contentContainer.value)
  }

  nextTick(() => {
    updateDimensions()

    // Watch content changes
    if (contentContainer.value) {
      mutationObserver = new MutationObserver(() => {
        nextTick(() => {
          updateDimensions()
        })
      })

      mutationObserver.observe(contentContainer.value, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      })
    }
  })
})

// Register onUnmounted during the synchronous setup phase
onUnmounted(() => {
  resizeObserver.disconnect()

  // Clean up the mutationObserver
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }

  if (scrollbarFadeTimer.value) {
    clearTimeout(scrollbarFadeTimer.value)
  }

  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', endDrag)
})

// Expose methods to the parent (with behavior options)
type ScrollBehaviorOptions = { behavior?: 'auto' | 'smooth' }
const scrollTo = (top: number, left = 0, options?: ScrollBehaviorOptions) => {
  const behavior = options?.behavior ?? 'auto'
  smooth.value = behavior === 'smooth'

  scrollTop.value = Math.max(0, Math.min(scrollHeight.value - clientHeight.value, top))
  scrollLeft.value = Math.max(0, Math.min(scrollWidth.value - clientWidth.value, left))

  if (behavior === 'smooth') {
    if (smoothOffTimer.value) {
      clearTimeout(smoothOffTimer.value)
    }
    smoothOffTimer.value = window.setTimeout(() => {
      smooth.value = false
    }, 120)
  }
}

defineExpose({
  scrollTo
})
</script>

<style scoped>
.scrollable-content-wrapper {
  position: relative;
  max-height: 320px;
  height: auto;
}

.scrollable-content-container {
  transition: none;
  overflow: visible;
  box-sizing: border-box;
}

.scrollable-content-container.smooth {
  transition: transform 0.12s ease-out;
}
</style>
