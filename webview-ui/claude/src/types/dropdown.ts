// Generic dropdown item data interface
export interface DropdownItemData {
  id: string
  label?: string        // display text
  name?: string         // fallback display text
  detail?: string       // secondary info (e.g. file path, description)
  hint?: string         // dimmed text after the label (e.g. a command's arguments)
  badge?: string        // where it comes from, shown as "(badge)" (e.g. user, project, plugin)
  icon?: string         // left icon CSS class
  rightIcon?: string    // right icon CSS class (e.g. an arrow)
  checked?: boolean     // whether checked
  disabled?: boolean    // whether disabled
  type?: string         // item type (for business logic)
  data?: any           // extra data
  [key: string]: any   // allows extension fields
}

// Item type of the Dropdown component
export interface DropdownItem {
  id: string
  label: string
  name?: string
  detail?: string
  icon?: string
  rightIcon?: string
  checked?: boolean
  disabled?: boolean
  type?: string
  data?: any
}

// Extension types: separator and section header
export interface DropdownSeparator {
  type: 'separator'
  id: string
}

export interface DropdownSectionHeader {
  type: 'section-header'
  id: string
  text?: string
}

// Union of all possible dropdown item types
export type DropdownItemType = DropdownItemData | DropdownSeparator | DropdownSectionHeader

// Type guards
export function isDropdownItemData(item: DropdownItemType): item is DropdownItemData {
  return item.type !== 'separator' && item.type !== 'section-header'
}

export function isDropdownSeparator(item: DropdownItemType): item is DropdownSeparator {
  return item.type === 'separator'
}

export function isDropdownSectionHeader(item: DropdownItemType): item is DropdownSectionHeader {
  return item.type === 'section-header'
}

// Export all types
export type { DropdownItemData as DropdownItemDataType }