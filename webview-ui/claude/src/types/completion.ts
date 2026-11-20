import type { Ref, ComputedRef } from 'vue'
import type { DropdownItemType } from './dropdown'

/**
 * Trigger query info
 * Records the trigger, the query text and the position range
 */
export interface TriggerQuery {
  /** Query text (excluding the trigger) */
  query: string
  /** Start position of the trigger in the text */
  start: number
  /** Query end position */
  end: number
  /** Trigger character (e.g. '/' or '@') */
  trigger: string
}

/**
 * Dropdown position info
 */
export interface DropdownPosition {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Completion mode
 * - inline: triggered by typing (e.g. /command, @file)
 * - manual: triggered manually (e.g. a button click)
 */
export type CompletionMode = 'inline' | 'manual'

/**
 * Completion config options
 */
export interface CompletionConfig<T> {
  /** Completion mode */
  mode: CompletionMode

  /** Trigger character (required in inline mode, e.g. '/' or '@') */
  trigger?: string

  /** Data provider function (supports an optional AbortSignal for cancelling requests) */
  provider: (query: string, signal?: AbortSignal) => Promise<T[]> | T[]

  /** Convert a data item to the DropdownItem format */
  toDropdownItem: (item: T) => DropdownItemType

  /** Item selection callback */
  onSelect: (item: T, query?: TriggerQuery) => void

  /** Anchor element (for computing the dropdown position) */
  anchorElement?: Ref<HTMLElement | null>

  /** Whether to show section headers (manual mode) */
  showSectionHeaders?: boolean

  /** Fields to search (for filtering, manual mode) */
  searchFields?: string[]

  /** Command section order (manual mode, optional) */
  sectionOrder?: readonly string[]
}

/**
 * Completion Dropdown return value
 */
export interface CompletionDropdown {
  /** Whether it is open */
  isOpen: Ref<boolean>

  /** Dropdown item list */
  items: ComputedRef<DropdownItemType[]>

  /** Currently active index */
  activeIndex: Ref<number>

  /** Dropdown position */
  position: ComputedRef<DropdownPosition>

  /** Current query text */
  query: Ref<string>

  /** Current trigger query info (inline mode) */
  triggerQuery: Ref<TriggerQuery | undefined>

  /** Navigation mode */
  navigationMode: Ref<'keyboard' | 'mouse'>

  /** Open the dropdown */
  open: () => void

  /** Close the dropdown */
  close: () => void

  /** Keyboard event handling */
  handleKeydown: (event: KeyboardEvent) => void

  /** Select the active item (e.g. on click) */
  selectActive: () => void

  /** Select an item by index (e.g. on click) */
  selectIndex: (index: number) => void

  /** Search handling (manual mode) */
  handleSearch: (term: string) => void

  /** Evaluate the query (used internally in inline mode) */
  evaluateQuery: (text: string, caretOffset?: number) => void

  /** Text replacement (inline mode) */
  replaceText: (text: string, replacement: string) => string

  /** Mouse entered an item (switch to mouse mode) */
  handleMouseEnter: (index: number) => void

  /** Mouse left the menu (reset the index) */
  handleMouseLeave: () => void

  /** Update the position manually */
  updatePosition: (pos: DropdownPosition) => void
}

/**
 * Keyboard navigation options
 */
export interface KeyboardNavigationOptions {
  /** Whether it is open */
  isOpen: Ref<boolean>

  /** Item list */
  items: ComputedRef<any[]>

  /** Currently active index */
  activeIndex: Ref<number>

  /** Callback for selecting the current item */
  onSelect: (index: number) => void

  /** Close callback */
  onClose: () => void

  /** Whether Tab selects */
  supportTab?: boolean

  /** Whether Escape closes */
  supportEscape?: boolean

  /** Callback on navigation (for switching the navigation mode) */
  onNavigate?: () => void

  /** Page size (default 5) */
  pageSize?: number
}

/**
 * Trigger detection options
 */
export interface TriggerDetectionOptions {
  /** Trigger character */
  trigger: string

  /** Custom regular expression (optional) */
  customRegex?: RegExp
}
