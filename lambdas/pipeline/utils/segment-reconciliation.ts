/**
 * Segment reconciliation utilities for word-level timing consistency.
 *
 * These utilities handle reconciling text changes with word-level timing data
 * using LCS (Longest Common Subsequence) diffing. Used by both LLM refinement
 * and replacement steps to maintain timing accuracy when words are added,
 * removed, or modified.
 */

import type { WhisperxSegment, WhisperxWord } from '../types'
import { computeDiff } from './lcs'

/**
 * Splits text into words by whitespace.
 * Preserves punctuation attached to words.
 */
export function textToWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

/**
 * Joins words back into text with single spaces.
 */
export function reconstructText(words: string[]): string {
  return words.join(' ').trim()
}

/**
 * Gets text from segment's words array, falling back to text field.
 * The words array is the source of truth for timing data.
 */
export function getSegmentWordsText(segment: WhisperxSegment): string {
  if (segment.words && segment.words.length > 0) {
    return segment.words.map((w) => w.word).join(' ')
  }
  return segment.text || ''
}

/**
 * Reconciles patched words with original segment timing using LCS diffing.
 *
 * Handles:
 * - Same word count: simple word text replacement
 * - Word removal: merges timing into adjacent word
 * - Word addition: splits timing from adjacent word
 *
 * Mutates the segment in-place.
 */
export function reconcileSegment(
  segment: WhisperxSegment,
  patchedWords: string[],
): void {
  // If segment has no words array, just update text field directly
  if (!segment.words || segment.words.length === 0) {
    segment.text = reconstructText(patchedWords)
    return
  }

  const originalWords = segment.words
  const originalWordStrings = originalWords.map((w) => w.word)

  // Same word count - simple case: just update word text
  if (originalWords.length === patchedWords.length) {
    for (let i = 0; i < originalWords.length; i++) {
      originalWords[i].word = patchedWords[i]
    }
    segment.text = reconstructText(patchedWords)
    return
  }

  // Different word count - use diff algorithm
  const diff = computeDiff(originalWordStrings, patchedWords)

  const result: WhisperxWord[] = []
  let pendingRemoval: WhisperxWord | null = null // Timing from a removed word at start

  for (const op of diff) {
    if (op.op === 'keep' && op.originalIndex !== undefined) {
      const origWord = originalWords[op.originalIndex]
      const newWord: WhisperxWord = { ...origWord, word: op.word }

      // If there's a pending removal at start, extend this word backward
      if (pendingRemoval !== null) {
        if (pendingRemoval.start !== undefined) {
          newWord.start = pendingRemoval.start
        }
        newWord.score = null
        pendingRemoval = null
      }

      result.push(newWord)
    } else if (op.op === 'remove' && op.originalIndex !== undefined) {
      const removedWord = originalWords[op.originalIndex]

      if (result.length > 0) {
        // Merge timing into previous word (extend end)
        const prev = result[result.length - 1]
        if (removedWord.end !== undefined) {
          prev.end = removedWord.end
        }
        prev.score = null
      } else {
        // No previous word yet - save/extend for merging into next
        if (pendingRemoval === null) {
          pendingRemoval = { ...removedWord }
        } else {
          // Extend the pending removal to cover this word too
          if (removedWord.end !== undefined) {
            pendingRemoval.end = removedWord.end
          }
        }
      }
    } else if (op.op === 'add') {
      const newWord: WhisperxWord = { word: op.word, score: null }

      if (result.length > 0) {
        // Split timing from previous word
        const prev = result[result.length - 1]
        if (prev.start !== undefined && prev.end !== undefined) {
          const midpoint = (prev.start + prev.end) / 2
          newWord.start = midpoint
          newWord.end = prev.end
          prev.end = midpoint
          prev.score = null
        }
        // Inherit speaker from previous word if present
        if (prev.speaker !== undefined) {
          newWord.speaker = prev.speaker
        }
      } else if (pendingRemoval !== null) {
        // Use timing from the pending removed word
        if (pendingRemoval.start !== undefined) {
          newWord.start = pendingRemoval.start
        }
        if (pendingRemoval.end !== undefined) {
          newWord.end = pendingRemoval.end
        }
        if (pendingRemoval.speaker !== undefined) {
          newWord.speaker = pendingRemoval.speaker
        }
        pendingRemoval = null
      } else {
        // No timing context available - use segment start
        newWord.start = segment.start
        newWord.end = segment.start
      }

      result.push(newWord)
    }
  }

  // Update segment in-place
  segment.words = result
  segment.text = reconstructText(patchedWords)
}
