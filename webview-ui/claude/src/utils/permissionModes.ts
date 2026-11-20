/**
 * Permission modes offered in the mode picker and by Shift+Tab.
 *
 * The CLI has no API listing the modes a session may use, so this table holds
 * the labels and the order; which modes appear is decided by what the CLI
 * reports: `auto` only when the selected model has `supportsAutoMode`,
 * `bypassPermissions` only when the user enabled it
 * (`ai-cli-diff-view.claudeAllowBypassPermissions`). A mode the CLI reports
 * that this table does not know (a newer CLI, or `dontAsk` from settings) is
 * still shown, under its raw name, instead of being hidden or reset.
 */
export interface ModeOption {
  id: string
  label: string
  icon: string
  description?: string
}

// Labels follow the official Claude Code VS Code extension.
const KNOWN_MODES: Record<string, Omit<ModeOption, 'id'>> = {
  default: { label: 'Manual', icon: 'codicon-chat', description: 'Ask before edits and shell commands' },
  acceptEdits: { label: 'Edit automatically', icon: 'codicon-edit', description: 'Edit files without asking' },
  plan: { label: 'Plan', icon: 'codicon-todos', description: 'Describe a plan, change nothing until approved' },
  bypassPermissions: { label: 'Bypass permissions', icon: 'codicon-warning', description: 'Run every tool without asking (isolated environments only)' },
  auto: { label: 'Auto', icon: 'codicon-sparkle', description: 'A classifier reviews actions instead of asking' },
  dontAsk: { label: "Don't ask", icon: 'codicon-circle-slash', description: 'Deny anything not pre-approved' },
}

export function describeMode(id: string): ModeOption {
  const known = KNOWN_MODES[id]
  return known ? { id, ...known } : { id, label: id, icon: 'codicon-shield' }
}

export interface ModeAvailability {
  supportsAutoMode?: boolean
  allowBypassPermissions?: boolean
  /** The mode the session is in now; always listed so it stays visible */
  current?: string
}

/** Same cycle order as the CLI: default → acceptEdits → plan → bypass → auto */
export function availableModes(opts: ModeAvailability): ModeOption[] {
  const ids = ['default', 'acceptEdits', 'plan']
  if (opts.allowBypassPermissions) ids.push('bypassPermissions')
  if (opts.supportsAutoMode) ids.push('auto')
  if (opts.current && !ids.includes(opts.current)) ids.push(opts.current)
  return ids.map(describeMode)
}

/** Next mode for Shift+Tab; a mode outside the cycle starts it over */
export function nextMode(modes: ModeOption[], current: string): string {
  const idx = modes.findIndex((m) => m.id === current)
  return modes[(idx + 1) % modes.length]?.id ?? 'default'
}
