import { ref, computed, watch } from 'vue'
import type {
  CompletionConfig,
  CompletionDropdown,
  DropdownPosition,
  TriggerQuery
} from '../types/completion'
import type { DropdownItemType } from '../types/dropdown'
import { useTriggerDetection } from './useTriggerDetection'
import { useKeyboardNavigation } from './useKeyboardNavigation'

/**
 * Generic completion Dropdown composable
 *
 * Wraps the full completion dropdown logic, with two modes:
 * - inline: triggered by typing (e.g. /command, @file)
 * - manual: triggered manually (e.g. a button click)
 *
 * @param config completion config
 * @returns completion dropdown state and methods
 *
 * @example
 * // inline mode
 * const slashCompletion = useCompletionDropdown({
 *   mode: 'inline',
 *   trigger: '/',
 *   provider: getSlashCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd, query) => { ... },
 *   anchorElement: inputRef
 * })
 *
 * @example
 * // manual mode
 * const commandMenu = useCompletionDropdown({
 *   mode: 'manual',
 *   provider: getCommands,
 *   toDropdownItem: (cmd) => ({ ... }),
 *   onSelect: (cmd) => { ... }
 * })
 */
export function useCompletionDropdown<T>(
  config: CompletionConfig<T>
): CompletionDropdown {
  const {
    mode,
    trigger,
    provider,
    toDropdownItem,
    onSelect,
    anchorElement,
    showSectionHeaders = false,
    searchFields = ['label', 'detail'],
    sectionOrder = []
  } = config

  // Validate the config
  if (mode === 'inline' && !trigger) {
    throw new Error('[useCompletionDropdown] inline mode requires the trigger option')
  }

  // === State ===
  const isOpen = ref(false)
  const activeIndex = ref(0)
  const query = ref('')
  const triggerQuery = ref<TriggerQuery | undefined>(undefined)
  const rawItems = ref<T[]>([])
  const navigationMode = ref<'keyboard' | 'mouse'>('keyboard') // navigation mode

  // === Trigger detection (inline mode) ===
  const triggerDetection = mode === 'inline' && trigger
    ? useTriggerDetection({ trigger })
    : null

  // === Data loading (serialized + race protection + debounce + AbortController) ===
  const requestSeq = ref(0)
  const isLoading = ref(false)
  let debounceTimerId: number | undefined
  let currentAbortController: AbortController | undefined

  async function loadItems(searchQuery: string, signal?: AbortSignal) {
    try {
      // Incrementing request number; only the latest request may write
      const seq = ++requestSeq.value
      isLoading.value = true

      const result = provider(searchQuery, signal)
      const data = result instanceof Promise ? await result : result

      // Only accept the latest request
      if (seq === requestSeq.value) {
        rawItems.value = (data ?? []) as T[]
      }
    } catch (error) {
      // Silently ignore AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('[useCompletionDropdown] Failed to load data:', error)
      rawItems.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Debounced load (inline mode only, 200ms delay + AbortController support)
  function loadItemsDebounced(searchQuery: string, delay = 200) {
    // Clear the previous debounce timer
    if (debounceTimerId !== undefined) {
      window.clearTimeout(debounceTimerId)
    }

    // Abort the previous request
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = undefined
    }

    debounceTimerId = window.setTimeout(() => {
      // Create a new AbortController
      currentAbortController = new AbortController()
      void loadItems(searchQuery, currentAbortController.signal)
    }, delay)
  }

  // === Item list processing ===
  const items = computed<DropdownItemType[]>(() => {
    if (rawItems.value.length === 0) return []

    // Convert to the DropdownItem format
    const source = (rawItems.value as unknown as T[]) || []
    let dropdownItems = source.map((it) => toDropdownItem(it as T))

    // manual mode: handle sections
    if (mode === 'manual' && showSectionHeaders) {
      dropdownItems = organizeItemsWithSections(dropdownItems)
    }

    return dropdownItems
  })

  // Organize items into sections
  function organizeItemsWithSections(items: DropdownItemType[]): DropdownItemType[] {
    if (!showSectionHeaders) return items

    const result: DropdownItemType[] = []
    const grouped = new Map<string, DropdownItemType[]>()

    // Group by section
    for (const item of items) {
      const section = (item as any).section || 'Other'
      if (!grouped.has(section)) {
        grouped.set(section, [])
      }
      grouped.get(section)!.push(item)
    }

    // Output in the given order
    const sections = sectionOrder.length > 0
      ? sectionOrder
      : Array.from(grouped.keys())

    for (const section of sections) {
      const sectionItems = grouped.get(section)
      if (!sectionItems || sectionItems.length === 0) continue

      // Add a separator (except before the first)
      if (result.length > 0) {
        result.push({
          id: `separator-${section}`,
          type: 'separator'
        } as DropdownItemType)
      }

      // Add the section header
      result.push({
        id: `section-${section}`,
        type: 'section-header',
        text: section
      } as DropdownItemType)

      // Add the items
      result.push(...sectionItems)
    }

    return result
  }

  // Navigable items (excluding separators and headers)
  const navigableItems = computed<T[]>(() => rawItems.value as unknown as T[])

  // === Position calculation ===
  const positionRef = ref<DropdownPosition>({ top: 0, left: 0, width: 0, height: 0 })
  const position = computed<DropdownPosition>(() => positionRef.value)

  // Update the position (can be called externally)
  function updatePosition(pos: DropdownPosition) {
    positionRef.value = pos
  }

  // Default position update (based on anchorElement)
  function updateDefaultPosition() {
    if (!anchorElement?.value) {
      positionRef.value = { top: 0, left: 0, width: 0, height: 0 }
      return
    }

    const rect = anchorElement.value.getBoundingClientRect()
    positionRef.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  }

  // === Keyboard navigation ===
  const navigation = useKeyboardNavigation({
    isOpen,
    items: computed(() => navigableItems.value),
    activeIndex,
    onSelect: (index) => {
      const item = navigableItems.value[index] as unknown as T
      if (item != null) {
        onSelect(item as T, triggerQuery.value)
        close()
      }
    },
    onClose: close,
    supportTab: true,
    supportEscape: mode === 'inline', // inline mode supports Escape
    onNavigate: () => {
      // Switch to keyboard mode on keyboard navigation
      navigationMode.value = 'keyboard'
    }
  })

  // === inline mode: query evaluation ===
  function evaluateQuery(text: string, caretOffset?: number) {
    if (mode !== 'inline' || !triggerDetection) return

    // Get the caret position
    const caret = caretOffset ?? triggerDetection.getCaretOffset(anchorElement?.value || null)
    if (caret === undefined) {
      triggerQuery.value = undefined
      isOpen.value = false
      return
    }

    // Find the trigger query
    const foundQuery = triggerDetection.findQuery(text, caret)
    triggerQuery.value = foundQuery

    if (foundQuery) {
      query.value = foundQuery.query
      isOpen.value = true
      activeIndex.value = 0
      // Use the debounced load to avoid frequent requests (200ms delay)
      loadItemsDebounced(foundQuery.query)
    } else {
      isOpen.value = false
    }
  }

  // === inline mode: text replacement ===
  function replaceText(text: string, replacement: string): string {
    if (mode !== 'inline' || !triggerDetection || !triggerQuery.value) {
      return text
    }

    return triggerDetection.replaceRange(text, triggerQuery.value, replacement)
  }

  // === manual mode: open/close ===
  function open() {
    isOpen.value = true
    activeIndex.value = 0
    query.value = ''
    void loadItems('')
  }

  function close() {
    isOpen.value = false
    activeIndex.value = -1 // reset to -1 on close
    query.value = ''
    triggerQuery.value = undefined
    rawItems.value = []
    navigationMode.value = 'keyboard' // reset the navigation mode
  }

  // === Mouse interaction ===
  function handleMouseEnter(index: number) {
    navigationMode.value = 'mouse'
    activeIndex.value = index
  }

  function handleMouseLeave() {
    // Reset the index to -1 when the mouse leaves (no selection)
    activeIndex.value = -1
  }

  // === manual mode: search (debounced) ===
  let debounceTimer: number | undefined
  function handleSearch(term: string) {
    query.value = term
    activeIndex.value = 0
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void loadItems(term)
    }, 120)
  }

  // === Keyboard event handling ===
  function handleKeydown(event: KeyboardEvent) {
    navigation.handleKeydown(event)
  }

  // === Select the current/given item directly (e.g. on mouse click) ===
  function selectActive() {
    // Reuse the navigation selection logic
    navigation.selectActive()
  }

  function selectIndex(index: number) {
    if (index < 0 || index >= navigableItems.value.length) return
    activeIndex.value = index
    const item = navigableItems.value[index] as unknown as T
    if (item != null) {
      onSelect(item as T, triggerQuery.value)
      close()
    }
  }

  // === Reload when the query changes (manual mode only; inline mode is triggered by evaluateQuery) ===
  // inline mode already calls loadItemsDebounced in evaluateQuery, avoiding duplicate triggers
  watch(query, (newQuery) => {
    // inline mode no longer loads through watch, preventing duplicate calls
    if (mode === 'inline') return
    // manual mode is triggered by handleSearch
    if (mode === 'manual') return

    if (isOpen.value) void loadItems(newQuery)
  })

  // === Clamp the selected index when the list changes, to avoid going out of bounds ===
  watch(items, (list) => {
    const len = list.length
    if (len === 0) {
      activeIndex.value = -1
      return
    }
    if (activeIndex.value < 0) activeIndex.value = 0
    if (activeIndex.value >= len) activeIndex.value = len - 1
  })

  return {
    isOpen,
    items,
    activeIndex,
    position,
    query,
    triggerQuery,
    navigationMode,
    // Expose loading (optional)
    // @ts-expect-error: extra exposed state, for backward compatibility
    loading: isLoading,
    open,
    close,
    handleKeydown,
    selectActive,
    selectIndex,
    handleSearch,
    evaluateQuery,
    replaceText,
    handleMouseEnter,
    handleMouseLeave,
    updatePosition
  }
}
