import type { KeyboardNavigationOptions } from '../types/completion'

/**
 * Keyboard navigation composable
 *
 * Wraps Up/Down, Enter, Tab, Escape, PageUp, PageDown and other keyboard navigation logic
 *
 * @param options navigation options
 * @returns keyboard navigation functions
 *
 * @example
 * const { handleKeydown, moveNext, movePrev } = useKeyboardNavigation({
 *   isOpen: ref(true),
 *   items: computed(() => [item1, item2]),
 *   activeIndex: ref(0),
 *   onSelect: (index) => console.log('Selected:', index),
 *   onClose: () => console.log('Closed'),
 *   pageSize: 5
 * })
 */
export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    isOpen,
    items,
    activeIndex,
    onSelect,
    onClose,
    supportTab = true,
    supportEscape = true,
    onNavigate,
    pageSize = 5
  } = options

  /**
   * Move to the next item
   */
  function moveNext() {
    if (items.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % items.value.length
    onNavigate?.() // fire the navigation callback
  }

  /**
   * Move to the previous item
   */
  function movePrev() {
    if (items.value.length === 0) return
    activeIndex.value =
      (activeIndex.value - 1 + items.value.length) % items.value.length
    onNavigate?.() // fire the navigation callback
  }

  /**
   * Page down
   */
  function moveNextPage() {
    if (items.value.length === 0) return
    const newIndex = Math.min(activeIndex.value + pageSize, items.value.length - 1)
    activeIndex.value = newIndex
    onNavigate?.() // fire the navigation callback
  }

  /**
   * Page up
   */
  function movePrevPage() {
    if (items.value.length === 0) return
    const newIndex = Math.max(activeIndex.value - pageSize, 0)
    activeIndex.value = newIndex
    onNavigate?.() // fire the navigation callback
  }

  /**
   * Select the active item
   */
  function selectActive() {
    if (items.value.length === 0) return
    onSelect(activeIndex.value)
  }

  /**
   * Reset the index to the first item
   */
  function reset() {
    activeIndex.value = 0
  }

  /**
   * Handle a keyboard event
   *
   * @param event keyboard event
   * @returns whether the event was handled
   */
  function handleKeydown(event: KeyboardEvent): boolean {
    // Only handle when open and there are items
    if (!isOpen.value || items.value.length === 0) {
      return false
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveNext()
        return true

      case 'ArrowUp':
        event.preventDefault()
        movePrev()
        return true

      case 'PageDown':
        event.preventDefault()
        moveNextPage()
        return true

      case 'PageUp':
        event.preventDefault()
        movePrevPage()
        return true

      case 'Enter':
        event.preventDefault()
        selectActive()
        return true

      case 'Tab':
        if (supportTab && !event.shiftKey) {
          event.preventDefault()
          selectActive()
          return true
        }
        break

      case 'Escape':
        if (supportEscape) {
          event.preventDefault()
          onClose()
          return true
        }
        break
    }

    return false
  }

  return {
    handleKeydown,
    moveNext,
    movePrev,
    moveNextPage,
    movePrevPage,
    selectActive,
    reset
  }
}
