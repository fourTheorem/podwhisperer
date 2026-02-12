import type { FillTimingGapsConfig } from '@podwhisperer/config'
import type { WhisperxResult, WhisperxSegment, WhisperxWord } from '../types'

/** A gap of consecutive words missing both start and end timestamps */
interface Gap {
  startIdx: number
  endIdx: number
}

/** Classification of where a gap occurs within a segment */
type GapType = 'start' | 'end' | 'middle' | 'entireSegment'

/** Stats returned by the fill-timing-gaps step */
export interface FillTimingGapsStats {
  totalSegments: number
  totalWords: number
  wordsFilled: number
  gapsFound: number
  gapTypes: {
    middle: number
    start: number
    end: number
    entireSegment: number
  }
}

/**
 * Finds groups of consecutive words where both start and end are undefined.
 */
function findGaps(words: WhisperxWord[]): Gap[] {
  const gaps: Gap[] = []
  let i = 0
  while (i < words.length) {
    if (words[i].start === undefined && words[i].end === undefined) {
      const startIdx = i
      while (
        i < words.length &&
        words[i].start === undefined &&
        words[i].end === undefined
      ) {
        i++
      }
      gaps.push({ startIdx, endIdx: i - 1 })
    } else {
      i++
    }
  }
  return gaps
}

/**
 * Classifies a gap based on its position within the words array.
 */
function classifyGap(gap: Gap, totalWords: number): GapType {
  if (gap.startIdx === 0 && gap.endIdx === totalWords - 1) {
    return 'entireSegment'
  }
  if (gap.startIdx === 0) {
    return 'start'
  }
  if (gap.endIdx === totalWords - 1) {
    return 'end'
  }
  return 'middle'
}

/**
 * Resolves the left and right time anchors for a gap.
 */
function resolveAnchors(
  gap: Gap,
  words: WhisperxWord[],
  segment: WhisperxSegment,
): { leftAnchor: number; rightAnchor: number } {
  const leftAnchor =
    gap.startIdx > 0
      ? (words[gap.startIdx - 1].end ?? segment.start)
      : segment.start
  const rightAnchor =
    gap.endIdx < words.length - 1
      ? (words[gap.endIdx + 1].start ?? segment.end)
      : segment.end
  return { leftAnchor, rightAnchor }
}

/**
 * Computes the character rate for a segment (seconds per character).
 */
function computeCharRate(segment: WhisperxSegment): number {
  const duration = segment.end - segment.start
  const totalChars = segment.text.length
  if (totalChars === 0 || duration <= 0) {
    return 0
  }
  return duration / totalChars
}

/**
 * Distributes timestamps proportionally across gap words based on character length.
 * Applies padding from anchors based on the segment's character rate.
 */
function distributeGap(
  words: WhisperxWord[],
  gap: Gap,
  leftAnchor: number,
  rightAnchor: number,
  charRate: number,
): void {
  const gapWords = words.slice(gap.startIdx, gap.endIdx + 1)
  const totalChars = gapWords.reduce((sum, w) => sum + w.word.length, 0)

  if (totalChars === 0) {
    // Edge case: all empty words, give them the same timestamp
    for (let i = gap.startIdx; i <= gap.endIdx; i++) {
      words[i].start = round3(leftAnchor)
      words[i].end = round3(leftAnchor)
      words[i].score = null
    }
    return
  }

  const interval = rightAnchor - leftAnchor

  // Calculate padding: use charRate as padding from each anchor
  let padding = charRate
  // Skip padding if it would consume more than half the available interval
  if (padding * 2 >= interval) {
    padding = 0
  }

  const paddedStart = leftAnchor + padding
  const paddedEnd = rightAnchor - padding
  const paddedInterval = paddedEnd - paddedStart

  if (paddedInterval <= 0) {
    // No room — assign all words the same timestamp
    for (let i = gap.startIdx; i <= gap.endIdx; i++) {
      words[i].start = round3(leftAnchor)
      words[i].end = round3(leftAnchor)
      words[i].score = null
    }
    return
  }

  let cursor = paddedStart
  for (let i = gap.startIdx; i <= gap.endIdx; i++) {
    const proportion = words[i].word.length / totalChars
    const duration = paddedInterval * proportion
    words[i].start = round3(cursor)
    words[i].end = round3(cursor + duration)
    words[i].score = null
    cursor += duration
  }
}

/**
 * Handles words that have only one of start/end missing (partial gaps).
 */
function fillPartialGaps(
  words: WhisperxWord[],
  segment: WhisperxSegment,
  charRate: number,
): number {
  let filled = 0
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word.start !== undefined && word.end === undefined) {
      const estimated = word.start + charRate * word.word.length
      const nextStart = words[i + 1]?.start
      word.end = round3(
        Math.min(
          estimated,
          segment.end,
          ...(nextStart !== undefined ? [nextStart] : []),
        ),
      )
      word.score = null
      filled++
    } else if (word.start === undefined && word.end !== undefined) {
      const estimated = word.end - charRate * word.word.length
      const prevEnd = words[i - 1]?.end
      word.start = round3(
        Math.max(
          estimated,
          segment.start,
          ...(prevEnd !== undefined ? [prevEnd] : []),
        ),
      )
      word.score = null
      filled++
    }
  }
  return filled
}

/**
 * Rounds a number to 3 decimal places (millisecond precision).
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Fills missing word timestamps in a WhisperX transcript using
 * character-proportional interpolation between anchor points.
 *
 * Mutates the transcript in place.
 *
 * @param transcript - WhisperX result to modify in place
 * @param config - Fill timing gaps configuration
 * @returns Stats about gaps found and filled
 */
export function fillTimingGaps(
  transcript: WhisperxResult,
  config: FillTimingGapsConfig,
): FillTimingGapsStats {
  const stats: FillTimingGapsStats = {
    totalSegments: 0,
    totalWords: 0,
    wordsFilled: 0,
    gapsFound: 0,
    gapTypes: { middle: 0, start: 0, end: 0, entireSegment: 0 },
  }

  if (!config.enabled) {
    return stats
  }

  stats.totalSegments = transcript.segments.length

  for (const segment of transcript.segments) {
    if (!segment.words || segment.words.length === 0) {
      continue
    }

    const words = segment.words
    stats.totalWords += words.length

    const charRate = computeCharRate(segment)

    // Handle partial gaps first (only start or end missing)
    stats.wordsFilled += fillPartialGaps(words, segment, charRate)

    // Find and fill complete gaps (both start and end missing)
    const gaps = findGaps(words)
    stats.gapsFound += gaps.length

    for (const gap of gaps) {
      const gapType = classifyGap(gap, words.length)
      stats.gapTypes[gapType]++

      const { leftAnchor, rightAnchor } = resolveAnchors(gap, words, segment)
      distributeGap(words, gap, leftAnchor, rightAnchor, charRate)

      stats.wordsFilled += gap.endIdx - gap.startIdx + 1
    }
  }

  return stats
}
