import { onMounted, onUnmounted } from 'vue'
import { keybindingManager, type KeyBinding } from './KeybindingManager'

export function useKeybinding(binding: KeyBinding | KeyBinding[]) {
  const list = Array.isArray(binding) ? binding : [binding]
  let unsubs: Array<() => void> = []

  onMounted(() => {
    unsubs = list.map((b) => keybindingManager.register(b))
  })

  onUnmounted(() => {
    for (const u of unsubs) try { u() } catch {}
    unsubs = []
  })
}

