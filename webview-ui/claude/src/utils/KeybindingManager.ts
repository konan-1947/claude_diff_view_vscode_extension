import { normalizeKeystroke, isEditableTarget } from './keyNormalize'

export interface KeyBinding {
  keys: string
  command?: string
  handler?: () => void
  scope?: string
  priority?: number
  when?: () => boolean
  allowInEditable?: boolean
}

type InternalBinding = KeyBinding & { id: number }

export class KeybindingManager {
  private bindings: InternalBinding[] = []
  private nextId = 1
  private listening = false

  constructor() {
    this.ensureListening()
  }

  private ensureListening() {
    if (this.listening) return
    document.addEventListener('keydown', this.onKeydown, true)
    this.listening = true
  }

  register(binding: KeyBinding): () => void {
    const id = this.nextId++
    const b: InternalBinding = { id, priority: 0, ...binding }
    this.bindings.push(b)
    // Keep sorted by priority, descending
    this.bindings.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    return () => this.unregister(id)
  }

  private unregister(id: number) {
    const i = this.bindings.findIndex((b) => b.id === id)
    if (i >= 0) this.bindings.splice(i, 1)
  }

  private onKeydown = (e: KeyboardEvent) => {
    const stroke = normalizeKeystroke(e)

    for (const b of this.bindings) {
      if (b.keys !== stroke) continue
      if (!b.allowInEditable && isEditableTarget(e.target)) continue
      if (b.when && !b.when()) continue

      // Execute
      try {
        if (b.handler) b.handler()
        // Running the command is left to the caller, which calls runtime.registry in its handler
      } catch {}

      e.preventDefault()
      e.stopPropagation()
      break
    }
  }
}

export const keybindingManager = new KeybindingManager()

