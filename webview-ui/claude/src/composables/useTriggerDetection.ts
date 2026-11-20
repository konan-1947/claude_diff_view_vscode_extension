import type { TriggerQuery, TriggerDetectionOptions } from '../types/completion'

/**
 * Trigger character detection composable
 *
 * Detects trigger characters (e.g. '/' or '@') in the input text and parses the query
 *
 * @param options detection options
 * @returns trigger detection functions
 *
 * @example
 * const { findQuery, getCaretOffset } = useTriggerDetection({ trigger: '/' })
 * const caret = getCaretOffset(inputElement)
 * const query = findQuery('hello /command world', caret)
 */
export function useTriggerDetection(options: TriggerDetectionOptions) {
  const { trigger, customRegex } = options

  /**
   * Get the caret offset within the text
   *
   * @param element contenteditable element
   * @returns caret offset, or undefined on failure
   */
  function getCaretOffset(element: HTMLElement | null): number | undefined {
    if (!element) return undefined

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return undefined

    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer)) return undefined

    // Create a range from the start of the element to the caret
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)

    return preCaretRange.toString().length
  }

  /**
   * Find the trigger query in the text
   *
   * @param text input text
   * @param caret caret position
   * @returns trigger query info, or undefined if not found
   */
  function findQuery(text: string, caret: number): TriggerQuery | undefined {
    // Build the regular expression
    // Matches: a trigger at line start or after a space, followed by characters that are neither spaces nor triggers
    const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = customRegex || new RegExp(
      `(?:^|\\s)${escapedTrigger}[^\\s${escapedTrigger}]*`,
      'g'
    )

    const matches = Array.from(text.matchAll(regex))

    for (const match of matches) {
      const matchIndex = match.index ?? 0
      // Find the actual position of the trigger (possibly after a space)
      const start = text.indexOf(trigger, matchIndex)
      const end = start + match[0].trim().length

      // Check whether the caret is within the trigger range
      if (caret > start && caret <= end) {
        return {
          query: text.substring(start + trigger.length, end),
          start,
          end,
          trigger
        }
      }
    }

    return undefined
  }

  /**
   * Replace the trigger range in the text
   *
   * @param text original text
   * @param query trigger query info
   * @param replacement replacement text
   * @returns text after replacement
   */
  function replaceRange(
    text: string,
    query: TriggerQuery,
    replacement: string
  ): string {
    const before = text.substring(0, query.start)
    const after = text.substring(query.end)
    // If no space follows, add one automatically
    const suffix = after.startsWith(' ') ? '' : ' '
    return `${before}${replacement}${suffix}${after}`
  }

  return {
    findQuery,
    getCaretOffset,
    replaceRange
  }
}
