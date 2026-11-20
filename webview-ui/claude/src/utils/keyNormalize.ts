export function normalizeKeystroke(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  // On mac, metaKey acts as cmd
  if (e.metaKey) parts.push('cmd')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  let key = (e.key || '').toLowerCase()
  // Normalize special key names
  const map: Record<string, string> = {
    ' ': 'space',
    escape: 'escape',
    esc: 'escape',
    enter: 'enter',
    return: 'enter',
    tab: 'tab',
    backspace: 'backspace',
    delete: 'delete',
    arrowup: 'arrowup',
    arrowdown: 'arrowdown',
    arrowleft: 'arrowleft',
    arrowright: 'arrowright'
  }
  key = map[key] || key

  parts.push(key)
  return parts.join('+')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

