import type { CommandAction } from '../core/AppContext'
import type { RuntimeInstance } from '../composables/useRuntime'
import type { DropdownItemType } from '../types/dropdown'

/**
 * Slash Command data provider
 *
 * Gets slash commands from CommandRegistry and filters them
 */

/**
 * Commands the CLI has no answer for through the SDK ("isn't available in this
 * environment"): this UI handles them itself with a panel, so they are listed
 * in the `/` suggestions next to the CLI's own (marked with another icon).
 */
export const UI_SLASH_COMMANDS: {
  name: string
  description: string
  argumentHint?: string
  aliases?: string[]
}[] = [
  { name: 'resume', description: 'Resume a previous conversation', argumentHint: '[conversation id or name]' },
  { name: 'help', description: 'Show shortcuts and all commands' },
  { name: 'memory', description: 'Open a CLAUDE.md memory file in the editor' },
  { name: 'status', description: 'Show version, model, account, MCP servers and settings files' },
  { name: 'export', description: 'Export the conversation to a markdown file or the clipboard', argumentHint: '[filename]' },
  { name: 'hooks', description: 'Show the hooks in your settings files' },
  { name: 'permissions', description: 'Manage allow, ask and deny tool permission rules', aliases: ['allowed-tools'] },
  { name: 'add-dir', description: 'Add a new working directory', argumentHint: '[path]' },
  { name: 'plugin', description: 'Enable or disable installed plugins', aliases: ['plugins'] },
  { name: 'release-notes', description: 'View release notes' },
  { name: 'rewind', description: 'Restore the code and/or conversation to a previous point', aliases: ['undo', 'checkpoint'] },
  { name: 'login', description: 'Sign in with your Anthropic account' },
  { name: 'logout', description: 'Sign out from your Anthropic account' },
]

const UI_COMMAND_PREFIX = 'ui-command-'

export function uiCommandId(name: string): string {
  return `${UI_COMMAND_PREFIX}${name}`
}

export function isUiCommand(command: CommandAction): boolean {
  return command.id.startsWith(UI_COMMAND_PREFIX)
}

// Command with section info
export interface CommandWithSection extends CommandAction {
  section: string
}

/**
 * Get slash commands
 *
 * @param query search query (optional)
 * @param runtime Runtime instance
 * @param _signal unused, only for interface consistency
 * @returns command list
 */
export function getSlashCommands(
  query: string,
  runtime: RuntimeInstance | undefined,
  _signal?: AbortSignal
): CommandAction[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const allCommands = commandsBySection['Slash Commands'] || []

  // Without a query, return all commands
  if (!query || !query.trim()) return allCommands

  // Match on the command name (the label starts with "/"); names starting with
  // the query rank first. Descriptions are only searched when no name matches.
  // An alias counts as a name (`/cost` finds `/usage`), as in the CLI.
  const q = query.trim().toLowerCase().replace(/^\//, '')
  const names = (cmd: CommandAction) => [cmd.label.slice(1), ...(cmd.aliases ?? [])].map(n => n.toLowerCase())
  const rank = (cmd: CommandAction) => {
    const all = names(cmd)
    if (all[0].startsWith(q)) return 0
    if (all.some(n => n.startsWith(q))) return 1
    return 2
  }
  const byName = allCommands
    .filter(cmd => names(cmd).some(n => n.includes(q)))
    .sort((a, b) => rank(a) - rank(b))
  if (byName.length > 0) return byName

  return allCommands.filter(cmd => cmd.description?.toLowerCase().includes(q))
}

/**
 * Get slash commands with section info (for ButtonArea)
 *
 * @param query search query (optional)
 * @param runtime Runtime instance
 * @returns command list with section info
 */
export function getSlashCommandsWithSection(
  query: string,
  runtime: RuntimeInstance | undefined
): CommandWithSection[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const results: CommandWithSection[] = []

  const SECTION_ORDER = ['Slash Commands'] as const

  // Iterate the sections
  for (const section of SECTION_ORDER) {
    const commands = commandsBySection[section]
    if (!commands || commands.length === 0) continue

    // Filter commands
    const lowerQuery = query.toLowerCase()
    const filteredCommands = query
      ? commands.filter(cmd =>
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.description?.toLowerCase().includes(lowerQuery)
        )
      : commands

    // Add section info
    for (const cmd of filteredCommands) {
      results.push({
        ...cmd,
        section
      })
    }
  }

  return results
}

/**
 * Convert a CommandAction to DropdownItemType
 *
 * @param command command object
 * @returns Dropdown item
 */
export function commandToDropdownItem(command: CommandAction): DropdownItemType {
  return {
    id: command.id,
    label: command.label,
    detail: command.description,
    // Shown on the name line, dimmed, like the CLI's `/model <model>  (user)`
    hint: [
      command.aliases?.length ? `(${command.aliases.join(', ')})` : '',
      command.argumentHint ?? '',
    ].filter(Boolean).join(' ') || undefined,
    badge: command.source,
    icon: isUiCommand(command) ? 'codicon-window' : 'codicon-symbol-method',
    type: 'command',
    data: { commandId: command.id, command }
  }
}

/**
 * Get the icon of a command
 *
 * @param command command object
 * @returns icon class name
 */
export function getCommandIcon(command: CommandAction): string | undefined {
  const label = command.label.toLowerCase()

  // Slash commands use the default icon
  if (label.startsWith('/')) {
    return 'codicon-symbol-method'
  }

  return undefined
}
