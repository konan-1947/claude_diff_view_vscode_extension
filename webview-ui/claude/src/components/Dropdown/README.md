# Dropdown component system

A generic Dropdown component system built on the principle of **separating the container from the content**.

## 🎯 Design philosophy

### Core principles
- **Dropdown**: a pure container component, responsible for positioning and show/hide logic
- **DropdownItem**: a generic data-driven component that adapts to different needs through its interface
- **Business logic**: implemented entirely by the consumer (e.g. ChatInputBox)

### Why it is generic
- ✓ Reusable for any dropdown scenario (menus, pickers, autocomplete, ...)
- ✓ Driven by a data interface, no hard-coded business logic
- ✓ Supports custom icons, styles and behavior
- ✓ Type-safe TypeScript interfaces

## 📋 Data interface

### DropdownItemData
```typescript
interface DropdownItemData {
  id: string           // unique id
  label?: string       // main display text
  name?: string        // fallback display text
  detail?: string      // secondary info (e.g. path, description)
  icon?: string        // left icon CSS class
  rightIcon?: string   // right icon CSS class
  checked?: boolean    // checked state
  disabled?: boolean   // disabled state
  type?: string        // business type id
  data?: any          // extra business data
  [key: string]: any  // extension fields
}
```

## 🔧 Usage examples

### Basic usage
```vue
<template>
  <Dropdown
    :is-visible="showDropdown"
    :position="dropdownPosition"
    @close="hideDropdown"
  >
    <template #content>
      <DropdownItem
        v-for="(item, index) in items"
        :key="item.id"
        :item="item"
        :index="index"
        @click="handleSelect"
      />
    </template>
  </Dropdown>
</template>
```

### Custom icons
```vue
<DropdownItem :item="item" :index="index">
  <template #icon="{ item }">
    <FileIcon v-if="item.type === 'file'" :file-name="item.name" />
    <i v-else :class="item.icon"></i>
  </template>
</DropdownItem>
```

### Business data example
```typescript
const contextItems: DropdownItemData[] = [
  {
    id: 'file-1',
    label: 'main.ts',
    detail: 'src/main.ts',
    type: 'file',
    data: { path: '/project/src/main.ts' }
  },
  {
    id: 'option-1',
    label: 'Settings',
    icon: 'codicon-settings',
    rightIcon: 'codicon-chevron-right',
    type: 'submenu',
    data: { category: 'settings' }
  }
]
```

## 🏗️ Component architecture

```
Dropdown (container)
├── ScrollableElement (scrolling)
│   └── business content (slot)
│       ├── DropdownItem (generic item)
│       ├── DropdownSeparator (separator)
│       └── custom content
└── Footer (footer info)
```

## 🎨 Styling

- Global CSS variables for consistency
- VS Code theme support
- Monaco-editor-style scrollbars
- Responsive design

## 📝 Best practices

1. **Data-driven**: all display logic is controlled through the data interface
2. **Type-safe**: TypeScript interfaces guarantee type checking
3. **Separation of concerns**: business logic lives in the consumer, the component stays generic
4. **Extensibility**: custom needs are covered by slots and data fields

## 🔄 Migration guide

Migrating from the hard-coded version to the generic one:

1. Move business data into the consumer
2. Redefine the data with the `DropdownItemData` interface
3. Use `item.type` and `item.data` for business decisions in event handlers
4. Use slots for special display needs

This design keeps the Dropdown component highly reusable and maintainable while staying very extensible.