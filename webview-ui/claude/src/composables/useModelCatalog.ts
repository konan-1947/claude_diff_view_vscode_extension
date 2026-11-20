import { ref, computed } from 'vue'
import { transport } from '../core/runtimeTransport'

/**
 * A model as the `claude` CLI lists it (SDK `supportedModels()`).
 *
 * Every capability field is optional and read defensively: an older CLI omits
 * some, and a newer one may add more (`supportsThinkingOff` is not even in the
 * SDK's type definitions yet). The UI is driven entirely by these flags, so a
 * CLI update that adds a model, an effort level or a capability shows up here
 * without an extension release.
 */
export interface CliModel {
  value: string
  resolvedModel?: string
  displayName: string
  description?: string
  supportsEffort?: boolean
  supportedEffortLevels?: string[]
  supportsAdaptiveThinking?: boolean
  supportsThinkingOff?: boolean
  supportsAutoMode?: boolean
  supportsFastMode?: boolean
}

export interface CatalogModel {
  id: string
  label: string
  description?: string
  /** Capabilities reported by the CLI; undefined for custom/fallback entries */
  info?: CliModel
}

/**
 * Used only when the CLI listed nothing (probe failed or timed out), so the
 * picker is never empty. Normally the CLI's list replaces these.
 */
const FALLBACK_MODELS: CatalogModel[] = [
  { id: 'default', label: 'Default' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
]

// Module-level state: one probe per webview, shared by every component.
const cliModels = ref<CliModel[]>([])
const customModels = ref<Array<{ id: string; name?: string }>>([])
const disabledModels = ref<string[]>([])
const loaded = ref(false)
let loading: Promise<void> | undefined
let configListening = false

function cleanLabel(displayName: string): string {
  return displayName.replace(/\s*\(recommended\)\s*$/i, '')
}

async function load(): Promise<void> {
  if (!configListening) {
    configListening = true
    transport.extensionConfigChanged.add(({ key, value }) => {
      if (key === 'customModels') customModels.value = value ?? []
      else if (key === 'disabledModels') disabledModels.value = value ?? []
    })
  }

  const [configRes, sdkRes] = await Promise.all([
    transport.getExtensionConfig().catch(() => null),
    transport.sdkProbe(['supportedModels'], 15000).catch(() => null),
  ])

  if (configRes?.config) {
    customModels.value = configRes.config.customModels ?? []
    disabledModels.value = configRes.config.disabledModels ?? []
  }

  const list = sdkRes?.data?.supportedModels
  if (Array.isArray(list) && list.length > 0) {
    // 'Custom model' is a pseudo-entry the CLI adds for a free-form model id
    cliModels.value = list.filter(
      (m: CliModel) => m && typeof m.value === 'string' && m.description !== 'Custom model'
    )
  } else {
    // Allow a later component mount to try again
    loading = undefined
  }
  loaded.value = true
}

const availableModels = computed<CatalogModel[]>(() => {
  const disabled = new Set(disabledModels.value)
  const seen = new Set<string>()
  const result: CatalogModel[] = []
  const push = (m: CatalogModel) => {
    if (seen.has(m.id) || disabled.has(m.id)) return
    seen.add(m.id)
    result.push(m)
  }

  if (cliModels.value.length > 0) {
    for (const m of cliModels.value) {
      push({ id: m.value, label: cleanLabel(m.displayName || m.value), description: m.description, info: m })
    }
  } else {
    FALLBACK_MODELS.forEach(push)
  }

  for (const cm of customModels.value) {
    push({ id: cm.id, label: cm.name || cm.id })
  }
  return result
})

/**
 * Capabilities of a model id: an exact match first, then a row whose
 * `resolvedModel` is that id (a session that stored an explicit model id
 * such as `claude-opus-5-5` matches the `opus` row).
 */
function findModelInfo(id: string | undefined): CliModel | undefined {
  const key = id || 'default'
  const models = cliModels.value
  return (
    models.find((m) => m.value === key) ??
    models.find((m) => m.resolvedModel === key) ??
    models.find((m) => m.resolvedModel && key.replace(/\[[^\]]*\]$/, '') === m.resolvedModel)
  )
}

function labelFor(id: string | undefined): string {
  const key = id || 'default'
  const fromList = availableModels.value.find((m) => m.id === key)
  if (fromList) return fromList.label
  const info = findModelInfo(key)
  if (info) return cleanLabel(info.displayName || info.value)
  const custom = customModels.value.find((m) => m.id === key)
  if (custom) return custom.name || custom.id
  return FALLBACK_MODELS.find((m) => m.id === key)?.label ?? key
}

export function useModelCatalog() {
  if (!loading) {
    loading = load().catch((e) => {
      console.error('Failed to load model list:', e)
      loading = undefined
      loaded.value = true
    })
  }
  return { availableModels, findModelInfo, labelFor, loaded }
}
