import type { ReplacementRule } from '@podwhisperer/config'
import type { WhisperxResult } from '../types'
import {
  getSegmentWordsText,
  reconcileSegment,
  textToWords,
} from '../utils/segment-reconciliation'

/**
 * Converts a replacement rule to a short string key for stats tracking.
 * Literal: "search->replacement"
 * Regex: "r'pattern'->replacement"
 */
export function ruleToKey(rule: ReplacementRule): string {
  if (rule.type === 'regex') {
    return `r'${rule.search}'->${rule.replacement}`
  }
  return `${rule.search}->${rule.replacement}`
}

/**
 * Pre-processed replacement rule with compiled regex
 */
interface CompiledRule {
  /** RegExp for regex rules, string for literal */
  pattern: RegExp | string
  /** Text to replace matches with */
  replacement: string
  /** Whether this is a regex rule */
  isRegex: boolean
  /** String key for stats tracking */
  key: string
}

/**
 * Result from applying compiled rules to text
 */
interface ApplyResult {
  text: string
  counts: Record<string, number>
}

/**
 * Stats returned by the replacement function
 */
export interface ReplacementStats {
  /** Number of segments that were modified */
  segmentsModified: number
  /** Number of word changes (added, removed, or modified words) */
  wordChanges: number
  /** Count of times each replacement rule was applied (key: ruleToKey output) */
  replacementCounts: Record<string, number>
}

/**
 * Pre-processes all rules into compiled form for efficient application.
 * @param rules - Array of replacement rules to compile
 * @returns Array of compiled rules ready for fast application
 */
function compileReplacementRules(rules: ReplacementRule[]): CompiledRule[] {
  return rules.map((rule) => {
    const key = ruleToKey(rule)
    if (rule.type === 'regex') {
      return {
        pattern: new RegExp(rule.search, 'g'),
        replacement: rule.replacement,
        isRegex: true,
        key,
      }
    }
    return {
      pattern: rule.search,
      replacement: rule.replacement,
      isRegex: false,
      key,
    }
  })
}

/**
 * Applies all compiled rules to a text string.
 * @param text - The text to apply rules to
 * @param compiledRules - Array of compiled replacement rules
 * @returns Object with the modified text and counts of each rule applied
 */
function applyCompiledRules(
  text: string,
  compiledRules: CompiledRule[],
): ApplyResult {
  let result = text
  const counts: Record<string, number> = {}

  for (const rule of compiledRules) {
    if (rule.isRegex) {
      // Reset lastIndex for global regex to avoid issues with repeated calls
      const regex = rule.pattern as RegExp
      regex.lastIndex = 0
      // Count matches before replacing
      const matches = result.match(regex)
      if (matches && matches.length > 0) {
        counts[rule.key] = (counts[rule.key] ?? 0) + matches.length
        result = result.replace(regex, rule.replacement)
      }
    } else {
      // Count literal matches
      const pattern = rule.pattern as string
      let count = 0
      let idx = result.indexOf(pattern)
      while (idx !== -1) {
        count++
        idx = result.indexOf(pattern, idx + pattern.length)
      }
      if (count > 0) {
        counts[rule.key] = (counts[rule.key] ?? 0) + count
        result = result.replaceAll(pattern, rule.replacement)
      }
    }
  }

  return { text: result, counts }
}

/**
 * Applies replacement rules to a WhisperX transcription result.
 * Mutates the result in place.
 *
 * Uses word-level reconciliation to handle multi-word replacements correctly.
 * The algorithm:
 * 1. Gets text from words array (source of truth)
 * 2. Applies all replacement rules to concatenated text
 * 3. Splits result back into words
 * 4. Uses LCS algorithm to reconcile with original word timing
 *
 * @param result - WhisperX result to modify in place
 * @param rules - Array of replacement rules to apply
 * @returns Stats object with replacement counts
 */
export function applyReplacements(
  result: WhisperxResult,
  rules: ReplacementRule[],
): ReplacementStats {
  const stats: ReplacementStats = {
    segmentsModified: 0,
    wordChanges: 0,
    replacementCounts: {},
  }

  if (rules.length === 0) {
    return stats
  }

  const compiledRules = compileReplacementRules(rules)

  for (const segment of result.segments) {
    // Get text from words array (source of truth for timing)
    const originalText = getSegmentWordsText(segment)
    const originalWordCount = segment.words?.length ?? 0

    // Apply all replacement rules to concatenated text
    const { text: patchedText, counts } = applyCompiledRules(
      originalText,
      compiledRules,
    )

    // Merge counts into stats
    for (const [key, count] of Object.entries(counts)) {
      stats.replacementCounts[key] = (stats.replacementCounts[key] ?? 0) + count
    }

    // Skip if no changes
    if (patchedText === originalText) {
      continue
    }

    // Split back into words
    const patchedWords = textToWords(patchedText)

    // Reconcile with word timing using LCS
    reconcileSegment(segment, patchedWords)

    stats.segmentsModified++
    // Count word changes as the difference in word count plus any position changes
    const newWordCount = segment.words?.length ?? 0
    stats.wordChanges += Math.abs(newWordCount - originalWordCount) || 1
  }

  return stats
}
