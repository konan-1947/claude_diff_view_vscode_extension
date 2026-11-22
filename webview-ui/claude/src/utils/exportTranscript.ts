import type { Message } from '../models/Message'
import type { ContentBlockWrapper } from '../models/ContentBlockWrapper'

/**
 * `/export`: the conversation as markdown. Text and thinking verbatim; a tool
 * call is one line (name + its main argument) with a shortened result, as the
 * CLI's export prints it.
 */

const RESULT_LINES = 12

function fence(text: string, lang = ''): string {
  // A fence longer than any backtick run inside, so the content cannot close it
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${text}\n${ticks}`
}

function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== 'object') return name
  const main =
    input.command ?? input.file_path ?? input.notebook_path ?? input.pattern ??
    input.url ?? input.query ?? input.description ?? input.prompt
  if (typeof main !== 'string' || !main) return name
  const oneLine = main.replace(/\s+/g, ' ').trim()
  return `${name}(${oneLine.length > 160 ? `${oneLine.slice(0, 159)}…` : oneLine})`
}

function resultText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : part?.type === 'image' ? '[image]' : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function shorten(text: string): string {
  const lines = text.replace(/\s+$/, '').split('\n')
  if (lines.length <= RESULT_LINES) return lines.join('\n')
  return `${lines.slice(0, RESULT_LINES).join('\n')}\n… +${lines.length - RESULT_LINES} lines`
}

function blockToMarkdown(wrapper: ContentBlockWrapper): string {
  const block = wrapper.content as any
  switch (block?.type) {
    case 'text':
      return typeof block.text === 'string' ? block.text.trim() : ''
    case 'thinking':
      return block.thinking?.trim() ? `<details><summary>Thinking</summary>\n\n${block.thinking.trim()}\n\n</details>` : ''
    case 'tool_use': {
      const head = `**${toolSummary(block.name, block.input)}**`
      const result = wrapper.getToolResultValue()
      if (!result) return head
      const text = shorten(resultText(result.content))
      const label = result.is_error ? 'Error:\n' : ''
      return text ? `${head}\n\n${label}${fence(text)}` : head
    }
    case 'image':
      return '[image]'
    case 'document':
      return '[document]'
    case 'selection':
      return `[selection: ${block.label ?? block.filePath}]`
    case 'opened_file':
      return ''
    case 'interrupt':
      return `_${block.friendlyMessage || block.message || 'Interrupted'}_`
    case 'notice':
      return `_${block.message}${block.detail ? ` (${block.detail})` : ''}_`
    case 'slash_command_result':
      return block.result ? fence(String(block.result).trim()) : ''
    case 'llm_error':
      return `**Error:** ${block.message}`
    case 'bash': {
      const parts: string[] = []
      if (block.command !== undefined) parts.push(fence(`! ${block.command}`))
      const output = [block.stdout, block.stderr].filter(Boolean).join('\n')
      if (output) parts.push(fence(shorten(output)))
      return parts.join('\n\n')
    }
    default:
      return ''
  }
}

function messageBody(message: Message): string {
  const content = message.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((w) => (w.content as any)?.type !== 'tool_result')
    .map(blockToMarkdown)
    .filter(Boolean)
    .join('\n\n')
}

export function transcriptToMarkdown(messages: Message[], title?: string): string {
  const parts: string[] = [`# ${title?.trim() || 'Claude conversation'}`]
  let lastRole: string | undefined
  for (const message of messages) {
    if (!['user', 'assistant', 'slash_command_result', 'bash'].includes(message.type)) continue
    const body = messageBody(message)
    if (!body) continue
    // A slash command's output comes from the CLI, so it reads as the reply
    // Bash mode is typed by the user, output included (the CLI ran it, not Claude)
    const role = message.type === 'user' || message.type === 'bash' ? 'User' : 'Claude'
    // Consecutive assistant messages are one reply
    if (role !== lastRole) parts.push(`## ${role}`)
    parts.push(body)
    lastRole = role
  }
  return `${parts.join('\n\n')}\n`
}

/** `claude-<title>-YYYY-MM-DD.md`, ASCII and dashes only */
export function exportFileName(title?: string): string {
  const slug = (title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .slice(0, 50)
    .replace(/-+$/, '')
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `claude-${slug ? `${slug}-` : ''}${date}.md`
}
