import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import { describeMode } from './permissionModes'

/**
 * Label of the "don't ask again" choice, built from the suggestions the CLI
 * sends with an ask (what it would save), in the CLI's wording:
 * "Yes, and don't ask again for `npm test` commands in this project",
 * "Yes, allow all edits during this session". Empty when there is nothing
 * to save.
 */
export function alwaysAllowLabel(suggestions: PermissionUpdate[]): string {
  const parts: string[] = []
  for (const s of suggestions) {
    if (s.type === 'addRules' && s.behavior === 'allow' && s.rules.length) {
      parts.push(`don't ask again for ${s.rules.map(formatRule).join(', ')}${where(s.destination)}`)
    } else if (s.type === 'setMode') {
      parts.push(
        s.mode === 'acceptEdits'
          ? `allow all edits${where(s.destination)}`
          : `switch to ${describeMode(s.mode).label} mode${where(s.destination)}`
      )
    } else if (s.type === 'addDirectories' && s.directories.length) {
      parts.push(`allow access to ${s.directories.map(dirName).join(', ')}${where(s.destination)}`)
    }
  }
  if (!parts.length) return ''
  // "allow all edits" reads as its own sentence; the rest follow "and"
  const [first, ...rest] = parts
  const head = first.startsWith('allow') ? `Yes, ${first}` : `Yes, and ${first}`
  return rest.length ? `${head}, and ${rest.join(', and ')}` : head
}

function formatRule(rule: { toolName: string; ruleContent?: string }): string {
  const content = rule.ruleContent?.trim()
  if (!content) return rule.toolName
  if (rule.toolName === 'Bash' || rule.toolName === 'PowerShell') {
    // `npm run:*` is a prefix rule: "`npm run` commands"
    return `\`${content.replace(/:\*$/, '')}\` commands`
  }
  if (rule.toolName === 'WebFetch' && content.startsWith('domain:')) {
    return `fetches from ${content.slice('domain:'.length)}`
  }
  return `${rule.toolName}(${content})`
}

function where(destination: string): string {
  switch (destination) {
    case 'session':
      return ' during this session'
    case 'localSettings':
    case 'projectSettings':
      return ' in this project'
    case 'userSettings':
      return ' in every project'
    default:
      return ''
  }
}

function dirName(dir: string): string {
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/)
  return `${parts[parts.length - 1] || dir}/`
}
