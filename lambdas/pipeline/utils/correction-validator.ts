/**
 * Validation utilities for LLM correction suggestions.
 *
 * These functions help detect and reject corrections that are too aggressive,
 * such as full sentence rewrites instead of targeted transcription fixes.
 */

import type { SuggestionValidationConfig } from '@podwhisperer/config'
import type { SuggestionIgnoreReason } from '../types'
import { computeDiff, computeLCS } from './lcs'

/** Result of validation check */
export interface ValidationResult {
  /** Whether the correction is valid */
  valid: boolean
  /** If invalid, the reason why */
  reason?: SuggestionIgnoreReason
}

/** Default validation config values */
export const DEFAULT_VALIDATION_CONFIG: Required<SuggestionValidationConfig> = {
  enabled: true,
  maxWordChangeRatio: 0.4,
  maxNormalizedEditDistance: 0.5,
  maxConsecutiveChanges: 3,
  minWordsForRatioCheck: 5,
}

/**
 * Calculates the Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Create 2D array for dynamic programming
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * Calculates the normalized edit distance between two strings.
 * Returns a value between 0 (identical) and 1 (completely different).
 */
export function normalizedEditDistance(
  original: string,
  corrected: string,
): number {
  if (original === corrected) return 0
  if (original.length === 0 && corrected.length === 0) return 0
  if (original.length === 0 || corrected.length === 0) return 1

  const distance = levenshteinDistance(original, corrected)
  return distance / Math.max(original.length, corrected.length)
}

/**
 * Splits text into words (case-insensitive for comparison).
 */
function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

/**
 * Calculates the ratio of words that changed between original and corrected.
 * Returns a value between 0 (no changes) and 1 (all words changed).
 *
 * Uses LCS (Longest Common Subsequence) to properly handle word insertions
 * and deletions without cascading misalignment (e.g., "lambda land" → "LambdaLith").
 */
export function wordChangeRatio(original: string, corrected: string): number {
  const originalWords = splitWords(original)
  const correctedWords = splitWords(corrected)

  if (originalWords.length === 0 && correctedWords.length === 0) return 0
  if (originalWords.length === 0 || correctedWords.length === 0) return 1

  // Use LCS to find common words (properly handles insertions/deletions)
  const { lcs } = computeLCS(originalWords, correctedWords)

  // Words changed = total unique words - common words
  const totalWords = Math.max(originalWords.length, correctedWords.length)
  const unchangedWords = lcs.length
  const changedWords = totalWords - unchangedWords

  return changedWords / totalWords
}

/**
 * Counts the maximum number of consecutive word changes.
 *
 * Uses LCS-based diff to properly handle word merges/splits without
 * cascading misalignment (e.g., "lambda land" → "LambdaLith").
 */
export function maxConsecutiveWordChanges(
  original: string,
  corrected: string,
): number {
  const originalWords = splitWords(original)
  const correctedWords = splitWords(corrected)

  if (originalWords.length === 0 || correctedWords.length === 0) {
    return Math.max(originalWords.length, correctedWords.length)
  }

  const diff = computeDiff(originalWords, correctedWords)

  let maxConsecutive = 0
  let currentConsecutive = 0

  for (const op of diff) {
    if (op.op !== 'keep') {
      currentConsecutive++
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
    } else {
      currentConsecutive = 0
    }
  }

  return maxConsecutive
}

/**
 * Validates whether a correction is acceptable (targeted fix vs full rewrite).
 *
 * @param originalText - The original text before correction
 * @param correctedText - The corrected text from LLM
 * @param config - Optional validation configuration
 * @returns ValidationResult indicating if the correction is valid
 */
export function validateCorrection(
  originalText: string,
  correctedText: string,
  config?: Partial<SuggestionValidationConfig>,
): ValidationResult {
  const cfg = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  // If validation is disabled, always return valid
  if (!cfg.enabled) {
    return { valid: true }
  }

  // Check for no-change (this is handled separately in llm-refinement.ts,
  // but including here for completeness)
  if (originalText === correctedText) {
    return { valid: false, reason: 'no-change' }
  }

  const originalWords = splitWords(originalText)

  // For short segments, be more lenient - only check consecutive changes
  if (originalWords.length < cfg.minWordsForRatioCheck) {
    const consecutive = maxConsecutiveWordChanges(originalText, correctedText)
    if (consecutive > cfg.maxConsecutiveChanges) {
      return { valid: false, reason: 'consecutive-changes' }
    }
    return { valid: true }
  }

  // Check word change ratio
  const wordRatio = wordChangeRatio(originalText, correctedText)
  if (wordRatio > cfg.maxWordChangeRatio) {
    return { valid: false, reason: 'word-change-ratio' }
  }

  // Check normalized edit distance
  const editDist = normalizedEditDistance(originalText, correctedText)
  if (editDist > cfg.maxNormalizedEditDistance) {
    return { valid: false, reason: 'edit-distance' }
  }

  // Check consecutive changes
  const consecutive = maxConsecutiveWordChanges(originalText, correctedText)
  if (consecutive > cfg.maxConsecutiveChanges) {
    return { valid: false, reason: 'consecutive-changes' }
  }

  return { valid: true }
}
