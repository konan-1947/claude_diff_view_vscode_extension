import { ref, onUnmounted, type Ref } from 'vue'

/** What a picker needs from its DropdownTrigger (exposed open/close). */
interface PickerTrigger {
  close: () => void
}

/**
 * Keyboard control for the input-bar pickers (model / mode / effort), as in
 * the CLI's menus: ↑ / ↓ move (wrapping), Enter picks, Esc closes.
 *
 * Wire `onOpen` / `onClose` to the DropdownTrigger's events, `activeIndex` /
 * `navMode` to its `selected-index` / `data-nav`, and `onMouseEnter` to each
 * DropdownItem. Keys are caught on window in the capture phase while the menu
 * is open, so they never reach the chat input underneath. Esc is handled here
 * too: ChatPage's Esc would otherwise also stop a running turn (its guard
 * looks for `.dropdown-popover`, not the trigger's popover).
 */
export function usePickerKeyboard(options: {
  trigger: Ref<PickerTrigger | undefined>
  count: () => number
  /** Index of the current value, highlighted when the menu opens */
  currentIndex: () => number
  onPick: (index: number) => void
}) {
  const activeIndex = ref(-1)
  const navMode = ref<'keyboard' | 'mouse'>('mouse')

  function onKeydown(event: KeyboardEvent) {
    const count = options.count()
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      activeIndex.value = (activeIndex.value + step + count) % count
      navMode.value = 'keyboard'
    } else if (event.key === 'Enter') {
      const index = activeIndex.value
      options.trigger.value?.close()
      if (index >= 0 && index < count) options.onPick(index)
    } else if (event.key === 'Escape') {
      options.trigger.value?.close()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function onOpen() {
    activeIndex.value = Math.max(0, options.currentIndex())
    navMode.value = 'keyboard'
    window.addEventListener('keydown', onKeydown, true)
  }

  function onClose() {
    window.removeEventListener('keydown', onKeydown, true)
  }

  function onMouseEnter(index: number) {
    navMode.value = 'mouse'
    activeIndex.value = index
  }

  onUnmounted(onClose)

  return { activeIndex, navMode, onOpen, onClose, onMouseEnter }
}
