<template>
  <div class="dropdown-trigger-container" ref="containerRef">
    <!-- Trigger button -->
    <div
      ref="triggerRef"
      :class="triggerClass"
      :style="triggerStyle"
      @click="toggleDropdown"
      v-bind="triggerProps"
    >
      <!-- Trigger content customized via slot -->
      <slot name="trigger" :isOpen="isVisible" :toggle="toggleDropdown">
        <!-- Default trigger style -->
        <span class="codicon codicon-chevron-down"></span>
      </slot>
    </div>

    <!-- Dropdown menu -->
    <div
      v-if="isVisible"
      ref="dropdownRef"
      class="dropdown-trigger-popover"
      :style="{ ...dropdownStyle, ...popoverStyle }"
      :data-nav="dataNav"
      @click.stop
    >
      <div
        tabindex="0"
        class="dropdown-trigger-container-inner"
        ref="innerContainerRef"
        :style="containerStyle"
        @keydown.escape="closeDropdown"
      >
        <!-- Search box (optional) -->
        <div v-if="showSearch" class="search-input-section">
          <input
            ref="searchInput"
            v-model="searchTerm"
            class="context-search-input"
            :placeholder="searchPlaceholder"
            @input="onSearchInput"
          />
        </div>

        <!-- Top area slot -->
        <slot name="header" />

        <!-- Middle scrollable area (auto height + max height limit) -->
        <ScrollableElement ref="scrollableRef" :horizontal-scroll="false">
          <div class="menu-content">
            <slot
              name="content"
              :search-term="searchTerm"
              :close="closeDropdown"
            />
          </div>
        </ScrollableElement>

        <!-- Bottom area slot -->
        <slot name="footer" />
      </div>
    </div>

  </div>

  <!-- Overlay for closing on outside click -->
  <div
    v-if="isVisible && closeOnClickOutside"
    class="dropdown-trigger-backdrop"
    @click="closeDropdown"
  ></div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import ScrollableElement from '../ScrollableElement.vue'

interface Props {
  // Trigger
  triggerClass?: string
  triggerStyle?: Record<string, any>
  triggerProps?: Record<string, any>

  // Dropdown menu
  width?: number
  /**
   * Grow to the content's natural width (one line per description), left
   * aligned to the trigger and capped only by the right edge of the viewport;
   * text wraps only once that cap is reached. Ignores `width` / `align`.
   */
  fitContent?: boolean
  contentHeight?: number
  containerStyle?: Record<string, any>
  popoverStyle?: Record<string, any>

  // Feature config
  showSearch?: boolean
  searchPlaceholder?: string
  shouldAutoFocus?: boolean
  closeOnClickOutside?: boolean
  align?: 'left' | 'right' | 'center'
  dataNav?: 'keyboard' | 'mouse' // navigation mode
  selectedIndex?: number
  scrollPadding?: number

  // Behavior control
  disabled?: boolean
}

interface Emits {
  (e: 'open'): void
  (e: 'close'): void
  (e: 'search', term: string): void
  (e: 'toggle', isOpen: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  containerStyle: () => ({}),
  popoverStyle: () => ({}),
  triggerClass: '',
  showSearch: false,
  searchPlaceholder: 'Search...',
  shouldAutoFocus: true,
  closeOnClickOutside: true,
  align: 'left',
  disabled: false,
  selectedIndex: -1,
  scrollPadding: 6
})

const emit = defineEmits<Emits>()

// DOM refs
const containerRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const dropdownRef = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const scrollableRef = ref<any>()
const innerContainerRef = ref<HTMLElement>()

// State
const isVisible = ref(false)
const searchTerm = ref('')

// Smart positioning
// Room from the trigger's left edge to the viewport's right edge, measured on
// open (fitContent)
const roomToRight = ref(0)

const dropdownStyle = computed(() => {
  if (props.fitContent) {
    return {
      position: 'absolute',
      minWidth: '140px',
      width: 'max-content',
      maxWidth: `${Math.max(140, roomToRight.value)}px`,
      left: '0px',
      zIndex: 2548,
      ...verticalPlacement()
    }
  }

  const style: any = {
    position: 'absolute',
    minWidth: '140px',
    maxWidth: props.width ? `${props.width}px` : '240px',
    width: props.width ? `${props.width}px` : 'auto',
    zIndex: 2548
  }

  if (!triggerRef.value) return style

  const viewportWidth = window.innerWidth
  const triggerRect = triggerRef.value.getBoundingClientRect()

  Object.assign(style, verticalPlacement())

  // Compute the dropdown width (for bounds checks)
  const dropdownWidth = props.width || 240 // use props.width or the default max width

  // Horizontal positioning - smart bounds handling
  const padding = 8 // screen edge margin

  // Set the initial position based on align
  let leftPosition = 0

  switch (props.align) {
    case 'right':
      // Right align: dropdown right edge aligns with the trigger's right edge
      leftPosition = triggerRect.right - dropdownWidth
      break
    case 'center':
      // Center align: dropdown center aligns with the trigger's center
      leftPosition = triggerRect.left + (triggerRect.width / 2) - (dropdownWidth / 2)
      break
    case 'left':
    default:
      // Left align: dropdown left edge aligns with the trigger's left edge
      leftPosition = triggerRect.left
      break
  }

  // Check the left edge
  if (leftPosition < padding) {
    leftPosition = padding
  }

  // Check the right edge
  if (leftPosition + dropdownWidth > viewportWidth - padding) {
    leftPosition = viewportWidth - dropdownWidth - padding
  }

  // Convert to a position relative to the trigger
  const relativeLeft = leftPosition - triggerRect.left
  style.left = `${relativeLeft}px`

  return style
})

// Above or below the trigger, whichever has room for the max height
function verticalPlacement(): Record<string, string> {
  const trigger = triggerRef.value
  if (!trigger) return {}
  const triggerRect = trigger.getBoundingClientRect()

  // Compute the total dropdown height
  const searchHeight = props.showSearch ? 32 : 0
  const footerHeight = 25
  const dropdownTotalHeight = searchHeight + 240 + footerHeight // use the max height of 240px

  // Compute the available space
  const spaceAbove = triggerRect.top
  const spaceBelow = window.innerHeight - triggerRect.bottom

  // Pick the display position smartly
  const showBelow = spaceBelow >= dropdownTotalHeight || spaceBelow > spaceAbove

  // Vertical positioning - relative to the trigger
  return showBelow
    ? { top: '100%', marginTop: '4px' }
    : { bottom: '100%', top: 'auto', marginBottom: '4px' }
}

// Methods
function toggleDropdown() {
  if (props.disabled) return

  if (isVisible.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

function openDropdown() {
  if (props.disabled) return

  if (props.fitContent && triggerRef.value) {
    const edgePadding = 8
    roomToRight.value = window.innerWidth - triggerRef.value.getBoundingClientRect().left - edgePadding
  }
  isVisible.value = true
  emit('open')
  emit('toggle', true)

  if (props.shouldAutoFocus && props.showSearch) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
}

function closeDropdown() {
  isVisible.value = false
  searchTerm.value = ''
  emit('close')
  emit('toggle', false)
}

function onSearchInput() {
  emit('search', searchTerm.value)
}

// Keyboard event handling
function handleKeydown(event: KeyboardEvent) {
  if (!isVisible.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

// Close on outside click
function handleClickOutside(event: MouseEvent) {
  if (!isVisible.value || !props.closeOnClickOutside) return

  const target = event.target as HTMLElement

  // Check whether the click was inside the component
  if (containerRef.value?.contains(target)) return

  closeDropdown()
}

// Lifecycle
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
})

// Minimal shift keeps the selected item in the visible area
function ensureSelectedVisible() {
  if (!isVisible.value) return
  if (props.selectedIndex == null || props.selectedIndex < 0) return

  const root = innerContainerRef.value
  const scrollable = scrollableRef.value
  if (!root || !scrollable) return

  const wrapper = root.querySelector('.scrollable-content-wrapper') as HTMLElement | null
  const content = root.querySelector('.scrollable-content-container') as HTMLElement | null
  const selectedEl = root.querySelector('.dropdown-menu-item[data-is-selected="true"]') as HTMLElement | null
  if (!wrapper || !content || !selectedEl) return

  const padding = props.scrollPadding ?? 6
  const wrapperH = wrapper.clientHeight
  const contentH = content.scrollHeight
  if (contentH <= wrapperH + 1) return

  const contentRect = content.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  const currentTop = wrapperRect.top - contentRect.top

  // offsetTop of the selected item relative to content
  let offsetTop = 0
  let el: HTMLElement | null = selectedEl
  while (el && el !== content) {
    offsetTop += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  const itemTop = offsetTop
  const itemBottom = itemTop + selectedEl.offsetHeight

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

  const maxTop = Math.max(0, contentH - wrapperH)
  newTop = Math.max(0, Math.min(maxTop, newTop))
  try {
    scrollable.scrollTo(newTop, 0, { behavior: 'auto' })
  } catch {}
}

watch(() => props.selectedIndex, () => {
  requestAnimationFrame(() => ensureSelectedVisible())
})

watch(isVisible, (visible) => {
  if (visible) requestAnimationFrame(() => ensureSelectedVisible())
})

// Exposed methods
defineExpose({
  open: openDropdown,
  close: closeDropdown,
  toggle: toggleDropdown,
  isOpen: computed(() => isVisible.value)
})
</script>

<style scoped>
.dropdown-trigger-container {
  position: relative;
  display: inline-block;
}

.dropdown-trigger-popover {
  box-sizing: border-box;
  padding: 0;
  border-radius: 6px;
  background-color: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-commandCenter-inactiveBorder, var(--vscode-widget-border));
  align-items: stretch;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 0 8px 2px color-mix(in srgb, var(--vscode-widget-shadow) 30%, transparent);
  contain: paint;
  outline: none;
  min-width: 140px;
  max-width: 240px;
  width: auto;
}

.dropdown-trigger-container-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  outline: none;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.dropdown-trigger-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2547;
  background: transparent;
}

.search-input-section {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 0 6px;
  border: none;
  box-sizing: border-box;
  outline: none;
  margin: 2px;
}

.context-search-input {
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

.context-search-input::placeholder {
  opacity: 0.5;
}

.menu-content {
  padding: 0.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
}

</style>
