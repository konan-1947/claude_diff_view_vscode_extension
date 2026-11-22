<template>
  <div
    v-if="isVisible"
    class="dropdown-popover fade-in-fast"
    :style="{ ...dropdownStyle, ...popoverStyle }"
    :data-nav="dataNav"
  >
    <div
      ref="containerRef"
      tabindex="0"
      class="dropdown-container"
      :style="containerStyle"
      @keydown.escape="close"
    >
      <!-- Built-in search box (optional) -->
      <div v-if="showSearch" class="search-input-section">
        <input
          ref="searchInput"
          v-model="searchTerm"
          class="context-search-input"
          :placeholder="searchPlaceholder"
          @input="onSearchInput"
        />
      </div>

      <!-- Top area slot (fully optional) -->
      <slot name="header" />

      <!-- Middle scrollable area - uses ScrollableElement -->
      <ScrollableElement ref="scrollableRef" :max-height="listMaxHeight">
        <div class="menu-content">
          <slot
            name="content"
            :search-term="searchTerm"
            :selected-index="selectedIndex"
          />
        </div>
      </ScrollableElement>

      <!-- Bottom area slot -->
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import ScrollableElement from '../ScrollableElement.vue'

export interface DropdownItem {
  id: string
  type: string
  [key: string]: any
}

interface Props {
  isVisible: boolean
  position: { top: number; left: number; width?: number; height?: number }
  width?: number
  contentHeight?: number
  containerStyle?: Record<string, any>
  popoverStyle?: Record<string, any>
  contentStyle?: Record<string, any>
  showSearch?: boolean
  searchPlaceholder?: string
  shouldAutoFocus?: boolean
  closeOnClickOutside?: boolean
  closeSelectors?: string[]
  align?: 'left' | 'right' | 'center'
  dataNav?: 'keyboard' | 'mouse' // navigation mode
  offsetY?: number // vertical offset (positive = away from the anchor, negative = over the anchor)
  offsetX?: number // horizontal offset (positive = right, negative = left)
  preferPlacement?: 'auto' | 'above' | 'below' // placement preference
  selectedIndex?: number // currently selected index (for visible item alignment)
  scrollPadding?: number // minimum gap between the selected item and the container edge
  /**
   * Grow to the content's natural width, capped only by the right edge of the
   * viewport; text wraps once that cap is reached. Ignores `width` / `align`.
   */
  fitContent?: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'select', item: DropdownItem): void
  (e: 'search', term: string): void
}

const props = withDefaults(defineProps<Props>(), {
  containerStyle: () => ({}),
  popoverStyle: () => ({}),
  contentStyle: () => ({}),
  showSearch: false,
  searchPlaceholder: 'Search...',
  shouldAutoFocus: true,
  closeOnClickOutside: true,
  closeSelectors: () => [],
  align: 'left',
  offsetY: 4,
  offsetX: 0,
  preferPlacement: 'auto',
  selectedIndex: -1,
  scrollPadding: 6
})

const emit = defineEmits<Emits>()

const searchInput = ref<HTMLInputElement>()
const searchTerm = ref('')
const selectedIndex = ref(0)
const scrollableRef = ref<any>()
const containerRef = ref<HTMLElement>()

const EDGE_MARGIN = 8

// Which side of the anchor the list opens on (preferPlacement, else the roomier side)
const placement = computed<'above' | 'below'>(() => {
  const rect = props.position
  const searchHeight = props.showSearch ? 32 : 0
  const dropdownTotalHeight = searchHeight + 240 + 25
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.top - (rect.height || 0)
  if (props.preferPlacement === 'below') return 'below'
  if (props.preferPlacement === 'above') return 'above'
  return spaceBelow >= dropdownTotalHeight || spaceBelow > spaceAbove ? 'below' : 'above'
})

// Height left for the scrolling list between the anchor and the viewport edge,
// so a long list scrolls instead of running off the view
const listMaxHeight = computed(() => {
  const rect = props.position
  const room = placement.value === 'above'
    ? rect.top - props.offsetY
    : window.innerHeight - rect.top - (rect.height || 0) - props.offsetY
  const chrome = (props.showSearch ? 32 : 0) + 2 // search box + borders
  return Math.max(80, Math.min(320, room - EDGE_MARGIN - chrome))
})

// Computed properties
const dropdownStyle = computed(() => {
  const style: any = {
    position: 'fixed',
    minWidth: '140px',
    maxWidth: '240px',
    width: props.width ? `${props.width}px` : 'auto',
    zIndex: 2548
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const triggerRect = props.position

  if (props.fitContent) {
    const left = Math.max(EDGE_MARGIN, triggerRect.left + props.offsetX)
    style.width = 'max-content'
    style.maxWidth = `${Math.max(140, viewportWidth - left - EDGE_MARGIN)}px`
    style.left = `${left}px`
    if (placement.value === 'below') {
      style.top = `${triggerRect.top + (triggerRect.height || 0) + props.offsetY}px`
    } else {
      style.bottom = `${viewportHeight - triggerRect.top + props.offsetY}px`
    }
    return style
  }

  // Compute the total dropdown height
  const searchHeight = props.showSearch ? 32 : 0  // search box height
  const footerHeight = 25 // footer height
  const dropdownTotalHeight = searchHeight + 240 + footerHeight // use the max height of 240px

  // Compute the available space above and below
  const spaceAbove = triggerRect.top
  const spaceBelow = viewportHeight - triggerRect.top - (triggerRect.height || 0)

  // Choose the position based on preferPlacement
  let showBelow: boolean
  if (props.preferPlacement === 'below') {
    showBelow = true
  } else if (props.preferPlacement === 'above') {
    showBelow = false
  } else {
    // auto mode: prefer below, use above when there is not enough space
    showBelow = spaceBelow >= dropdownTotalHeight || spaceBelow > spaceAbove
  }

  // Vertical positioning (uses offsetY; positive = away from the anchor, negative = over the anchor)
  if (showBelow) {
    // Show below the trigger
    style.top = `${triggerRect.top + (triggerRect.height || 0) + props.offsetY}px`
  } else {
    // Show above the trigger (a negative offsetY "overlaps" the anchor's top edge)
    style.bottom = `${viewportHeight - triggerRect.top + props.offsetY}px`
  }

  // Horizontal positioning - supports left, right and center alignment
  const triggerWidth = triggerRect.width || 0
  // Compute with the given width or the default max width of 240px
  const dropdownWidth = props.width || 240

  // Compute the initial left position (based on align)
  let leftPosition = 0
  switch (props.align) {
    case 'right':
      // Right align: dropdown right edge aligns with the trigger's right edge
      leftPosition = triggerRect.left + triggerWidth - dropdownWidth
      break
    case 'center':
      // Center align: dropdown center aligns with the trigger's center
      leftPosition = triggerRect.left + triggerWidth / 2 - dropdownWidth / 2
      break
    case 'left':
    default:
      // Left align: dropdown left edge aligns with the trigger's left edge
      leftPosition = triggerRect.left
      break
  }

  // Apply the horizontal offset
  leftPosition += props.offsetX

  // Keep within the screen bounds
  const leftBoundary = 8  // minimum left margin
  const rightPadding = 24 // right-side safety distance
  const rightBoundary = viewportWidth - rightPadding

  if (leftPosition < leftBoundary) {
    leftPosition = leftBoundary
  } else if (leftPosition + dropdownWidth > rightBoundary) {
    // The menu would overflow the right edge: shift left and leave extra spacing
    leftPosition = rightBoundary - dropdownWidth
  }

  style.left = `${leftPosition}px`

  return style
})

// Methods
function close() {
  emit('close')
}

function onSearchInput() {
  emit('search', searchTerm.value)
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!props.isVisible) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

// Close on outside click
function handleClickOutside(event: MouseEvent) {
  if (!props.isVisible || !props.closeOnClickOutside) return

  const target = event.target as HTMLElement

  // Check whether the click was inside the dropdown
  if (target.closest('.dropdown-popover')) return

  // Check whether the trigger element was clicked
  const excludeSelectors = [
    '.premium-pill',
    '.dropdown-trigger',
    ...props.closeSelectors
  ]

  for (const selector of excludeSelectors) {
    if (target.closest(selector)) return
  }

  close()
}

// Lifecycle
watch(() => props.isVisible, (visible) => {
  if (visible && props.shouldAutoFocus) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
})

// Minimal shift: keep the selected item inside the visible area
function ensureSelectedVisible() {
  if (!props.isVisible) return
  if (props.selectedIndex == null || props.selectedIndex < 0) return

  const root = containerRef.value
  const scrollable = scrollableRef.value
  if (!root || !scrollable) return

  const wrapper = root.querySelector('.scrollable-content-wrapper') as HTMLElement | null
  const content = root.querySelector('.scrollable-content-container') as HTMLElement | null
  const selectedEl = root.querySelector('.dropdown-menu-item[data-is-selected="true"]') as HTMLElement | null
  if (!wrapper || !content || !selectedEl) return

  const padding = props.scrollPadding ?? 6
  const wrapperH = wrapper.clientHeight
  const contentH = content.scrollHeight

  // If the content is too short to scroll, return early to avoid blank padding
  if (contentH <= wrapperH + 1) return

  // Current "scroll amount" (derived from the transform)
  const contentRect = content.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  const currentTop = wrapperRect.top - contentRect.top

  // Offset of the selected item relative to the content top
  let offsetTop = 0
  let el: HTMLElement | null = selectedEl
  while (el && el !== content) {
    offsetTop += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  const itemTop = offsetTop
  const itemBottom = itemTop + selectedEl.offsetHeight

  // Target visible window bounds
  const visibleTop = currentTop + padding
  const visibleBottom = currentTop + wrapperH - padding

  let newTop = currentTop
  if (itemTop < visibleTop) {
    newTop = itemTop - padding
  } else if (itemBottom > visibleBottom) {
    newTop = itemBottom - wrapperH + padding
  } else {
    return
  }

  // Strictly clamp the scroll range so it never scrolls past the content
  const maxTop = Math.max(0, contentH - wrapperH)
  newTop = Math.max(0, Math.min(maxTop, newTop))

  try {
    scrollable.scrollTo(newTop, 0, { behavior: 'auto' })
  } catch {}
}

watch(() => props.selectedIndex, () => {
  // Use a double RAF to make sure DOM updates and layout are both done
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ensureSelectedVisible())
  })
})

watch(() => props.isVisible, (visible) => {
  if (visible) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ensureSelectedVisible())
    })
  }
})

// Expose methods to the parent component
defineExpose({
  focusSearch: () => searchInput.value?.focus(),
  setSearchTerm: (term: string) => { searchTerm.value = term },
  getSearchTerm: () => searchTerm.value
})
</script>

<style scoped>
.dropdown-popover {
  box-sizing: border-box;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  border: none;
  align-items: stretch;
  font-size: 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
  visibility: visible;
  transform-origin: left top;
  box-shadow: 0 0 8px 2px color-mix(in srgb, var(--vscode-widget-shadow) 30%, transparent);
  min-width: 140px;
  max-width: 240px;
  width: auto;
}

.dropdown-container {
  box-sizing: border-box;
  border-radius: 6px;
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-commandCenter-inactiveBorder, var(--vscode-widget-border));
  align-items: stretch;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  contain: paint;
  outline: none;
  pointer-events: auto;
}

.search-input-container {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 0 6px;
  border: none;
  box-sizing: border-box;
  outline: none;
  margin: 2px;
}

.search-input {
  font-size: 12px;
  line-height: 15px;
  border-radius: 3px;
  background: transparent;
  color: var(--vscode-input-foreground);
  padding: 3px 0;
  flex: 1;
  min-width: 0;
  border: none !important;
  outline: none !important;
  box-sizing: border-box;
}

.search-input::placeholder {
  opacity: 0.5;
}

.menu-content {
  padding: 0.125rem;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.menu-sections {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px;
}

.dropdown-footer {
  flex-shrink: 0;
  background-color: var(--vscode-dropdown-background);
  border-top: 1px solid var(--vscode-commandCenter-inactiveBorder, var(--vscode-widget-border));
}

/* Fade-in animation */
.fade-in-fast {
  animation: fadein 0.1s linear;
}

@keyframes fadein {
  0% {
    opacity: 0;
    visibility: visible;
  }
  to {
    opacity: 1;
  }
}
</style>
