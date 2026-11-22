import type { CommandAction } from '../core/AppContext'
import type { RuntimeInstance } from '../composables/useRuntime'
import type { DropdownItemType } from '../types/dropdown'

/**
 * Slash Command data provider
 *
 * Gets slash commands from CommandRegistry and filters them
 */

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
  const q = query.trim().toLowerCase().replace(/^\//, '')
  const byName = allCommands
    .filter(cmd => cmd.label.toLowerCase().slice(1).includes(q))
    .sort((a, b) => {
      const pa = a.label.toLowerCase().slice(1).startsWith(q) ? 0 : 1
      const pb = b.label.toLowerCase().slice(1).startsWith(q) ? 0 : 1
      return pa - pb
    })
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
    icon: 'codicon-symbol-method',
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
