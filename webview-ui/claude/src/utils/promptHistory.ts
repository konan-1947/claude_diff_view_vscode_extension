import { ref } from 'vue'
import type { PromptHistoryEntry } from '@shared/messages'
import type { BaseTransport } from '../transport/BaseTransport'

/**
 * Prompt history for ↑/↓ and Ctrl+R, shared with the CLI through
 * `~/.claude/history.jsonl` (same file, same per-project filter). Kept in
 * memory so ↑ answers at once; refreshed when the input gets focus, which
 * picks up prompts typed meanwhile in a CLI terminal.
 */
const entries = ref<PromptHistoryEntry[]>([])
let lastLoad = 0
let loading: Promise<void> | undefined

const REFRESH_MS = 2000

export function usePromptHistory(getConnection: () => Promise<BaseTransport | undefined>, getCwd: () => string | undefined) {
  async function refresh(force = false): Promise<void> {
    if (loading) return loading
    if (!force && Date.now() - lastLoad < REFRESH_MS) return
    loading = (async () => {
      try {
        const connection = await getConnection()
        if (!connection) return
        entries.value = await connection.getPromptHistory(getCwd())
        lastLoad = Date.now()
      } catch (error) {
        console.warn('[promptHistory] load failed:', error)
      } finally {
        loading = undefined
      }
    })()
    return loading
  }

  /** A typed prompt: newest first at once, then written for the CLI too */
  function record(text: string, sessionId?: string): void {
    const display = text.trim()
    if (!display) return
    entries.value = [
      { display, timestamp: Date.now() },
      ...entries.value.filter((e) => e.display !== display),
    ]
    void (async () => {
      try {
        await (await getConnection())?.addPromptHistory(display, getCwd(), sessionId)
      } catch (error) {
        console.warn('[promptHistory] save failed:', error)
      }
    })()
  }

  return { entries, refresh, record }
}
