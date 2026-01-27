import type { NormalizationConfig } from '@podwhisperer/config'
import type { WhisperxResult, WhisperxSegment, WhisperxWord } from '../types'

/**
 * Distribution statistics for a set of numeric values
 */
export interface DistributionStats {
  min: number
  max: number
  avg: number
  p95: number
}

/**
 * Stats returned by the normalization function
 */
export interface NormalizationStats {
  /** Original number of segments */
  originalSegments: number
  /** Number of segments after normalization */
  normalizedSegments: number
  /** Number of splits performed */
  splits: number
  /** Distribution stats for words per segment */
  wordsPerSegment: DistributionStats
  /** Distribution stats for characters per segment */
  charsPerSegment: DistributionStats
}

/**
 * Checks if a word ends with any of the punctuation characters.
 */
function endsWithPunctuation(
  word: string,
  punctuationChars: string[],
): boolean {
  return punctuationChars.some((char) => word.endsWith(char))
}

/**
 * Creates a new segment from a subset of words.
 */
function createSegmentFromWords(
  words: WhisperxWord[],
  speaker?: string,
): WhisperxSegment {
  const text = words
    .map((w) => w.word)
    .join(' ')
    .trim()
  const start = words[0]?.start ?? 0
  const end = words[words.length - 1]?.end ?? 0

  return {
    start,
    end,
    text,
    speaker,
    words: [...words],
  }
}

/**
 * Calculate the character count for a list of words (including spaces).
 */
function calculateChars(words: WhisperxWord[]): number {
  if (words.length === 0) return 0
  // Words joined by spaces, so total = sum of word lengths + (n-1) spaces
  return words.reduce((sum, w) => sum + w.word.length, 0) + (words.length - 1)
}

/**
 * Compute distribution statistics for a set of numeric values.
 */
function computeDistributionStats(values: number[]): DistributionStats {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  const p95Idx = Math.ceil(0.95 * sorted.length) - 1
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / values.length) * 100) / 100,
    p95: sorted[Math.max(0, p95Idx)],
  }
}

/**
 * Normalize transcript segments for improved readability.
 *
 * Long segments can be difficult to read when displayed as captions over video.
 * This function splits segments into smaller chunks based on:
 * - Maximum words per segment
 * - Maximum characters per segment
 * - Natural punctuation boundaries
 * - Speaker changes
 *
 * @param transcript - WhisperX result to modify in place
 * @param config - Normalization configuration
 * @returns Stats about the normalization process
 */
export function normalizeSegments(
  transcript: WhisperxResult,
  config: NormalizationConfig,
): NormalizationStats {
  const stats: NormalizationStats = {
    originalSegments: transcript.segments.length,
    normalizedSegments: 0,
    splits: 0,
    wordsPerSegment: { min: 0, max: 0, avg: 0, p95: 0 },
    charsPerSegment: { min: 0, max: 0, avg: 0, p95: 0 },
  }

  const newSegments: WhisperxSegment[] = []

  for (const segment of transcript.segments) {
    // Skip segments without words array
    if (!segment.words || segment.words.length === 0) {
      newSegments.push(segment)
      continue
    }

    const segmentSplits = splitSegment(segment, config)
    newSegments.push(...segmentSplits)

    // Track splits (splits = new segments - 1)
    if (segmentSplits.length > 1) {
      stats.splits += segmentSplits.length - 1
    }
  }

  // Replace segments in place
  transcript.segments = newSegments
  stats.normalizedSegments = newSegments.length

  // Compute distribution stats
  const wordCounts = newSegments.map((s) => s.words?.length ?? 0)
  const charCounts = newSegments.map((s) => s.text.length)
  stats.wordsPerSegment = computeDistributionStats(wordCounts)
  stats.charsPerSegment = computeDistributionStats(charCounts)

  return stats
}

/**
 * Split a single segment according to the normalization rules.
 */
function splitSegment(
  segment: WhisperxSegment,
  config: NormalizationConfig,
): WhisperxSegment[] {
  // We know words exists because we check before calling this function
  const words = segment.words as WhisperxWord[]
  const results: WhisperxSegment[] = []

  let currentWords: WhisperxWord[] = []
  let currentSpeaker = segment.speaker

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isLastWord = i === words.length - 1

    // Check for speaker change (force split before this word)
    if (
      config.splitSegmentAtSpeakerChange &&
      word.speaker &&
      currentSpeaker &&
      word.speaker !== currentSpeaker &&
      currentWords.length > 0
    ) {
      // Flush current segment
      results.push(createSegmentFromWords(currentWords, currentSpeaker))
      currentWords = []
      currentSpeaker = word.speaker
    }

    // Calculate what chars/words would be if we add this word
    const projectedWords = currentWords.length + 1
    const projectedChars =
      calculateChars(currentWords) +
      (currentWords.length > 0 ? 1 : 0) + // space before new word
      word.word.length

    // Hard split check: would adding this word exceed limits?
    const wouldExceedWords = projectedWords > config.maxWordsPerSegment
    const wouldExceedChars = projectedChars > config.maxCharsPerSegment

    if ((wouldExceedWords || wouldExceedChars) && currentWords.length > 0) {
      // Flush current segment first
      results.push(createSegmentFromWords(currentWords, currentSpeaker))
      currentWords = []
    }

    // Add the word
    currentWords.push(word)
    currentSpeaker = word.speaker ?? currentSpeaker

    // Soft split check: should we split after this word due to punctuation?
    if (!isLastWord && currentWords.length > 0) {
      const currentChars = calculateChars(currentWords)
      const charsProgress = currentChars / config.maxCharsPerSegment
      const wordsProgress = currentWords.length / config.maxWordsPerSegment
      const closerToLimit = Math.max(charsProgress, wordsProgress)

      if (
        closerToLimit >= config.punctuationSplitThreshold &&
        endsWithPunctuation(word.word, config.punctuationChars)
      ) {
        // Split after this punctuation
        results.push(createSegmentFromWords(currentWords, currentSpeaker))
        currentWords = []
      }
    }
  }

  // Flush any remaining words
  if (currentWords.length > 0) {
    results.push(createSegmentFromWords(currentWords, currentSpeaker))
  }

  return results
}
