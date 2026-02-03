import type { CaptionsConfig } from '@podwhisperer/config'
import type { WhisperxSegment, WhisperxWord } from '../../types'
import {
  buildSpeakerPrefix,
  escapeHtml,
  formatSrtTimestamp,
  highlightText,
} from './formatting'
import type { CaptionCue, GeneratorOptions } from './types'

/**
 * Get the effective speaker for a segment.
 */
function getSegmentSpeaker(segment: WhisperxSegment): string {
  return (
    segment.speaker ||
    (segment.words?.[0]?.speaker ?? undefined) ||
    'SPEAKER_00'
  )
}

/**
 * Build full segment text from words, with HTML escaping.
 */
function buildSegmentText(words: WhisperxWord[]): string {
  return words.map((w) => escapeHtml(w.word)).join(' ')
}

/**
 * Build segment text with one word highlighted.
 */
function buildHighlightedText(
  words: WhisperxWord[],
  highlightIndex: number,
  highlightWith: CaptionsConfig['highlightWith'],
): string {
  return words
    .map((w, i) => {
      const escaped = escapeHtml(w.word)
      return i === highlightIndex
        ? highlightText(escaped, highlightWith)
        : escaped
    })
    .join(' ')
}

/**
 * Check if a word has valid timing data.
 */
function hasValidTiming(word: WhisperxWord): boolean {
  return (
    word.start !== undefined &&
    word.end !== undefined &&
    word.start >= 0 &&
    word.end > word.start
  )
}

/**
 * Check if segment has valid timing for distribution.
 */
function hasValidSegmentTiming(
  segmentStart: number,
  segmentEnd: number,
): boolean {
  return segmentEnd > 0 && segmentEnd > segmentStart
}

/**
 * Distribute timing evenly across words that are missing timing data.
 * Only called when segment has valid timing.
 * Modifies words in place.
 */
function distributeTimingIfMissing(
  words: WhisperxWord[],
  segmentStart: number,
  segmentEnd: number,
): void {
  const duration = segmentEnd - segmentStart
  const wordDuration = duration / words.length

  for (let i = 0; i < words.length; i++) {
    if (words[i].start === undefined) {
      words[i].start = segmentStart + i * wordDuration
    }
    if (words[i].end === undefined) {
      words[i].end = segmentStart + (i + 1) * wordDuration
    }
  }
}

/**
 * Generate cues for a segment with word highlighting.
 * Words without valid timing are skipped (they still appear in segment text, just not highlighted).
 */
function generateHighlightedCues(
  words: WhisperxWord[],
  speaker: string | undefined,
  previousSpeaker: string | undefined,
  config: CaptionsConfig,
  segmentStart: number,
  segmentEnd: number,
): CaptionCue[] {
  if (words.length === 0) {
    return []
  }

  // If segment has valid timing, distribute it to words missing timing
  if (hasValidSegmentTiming(segmentStart, segmentEnd)) {
    distributeTimingIfMissing(words, segmentStart, segmentEnd)
  }

  const cues: CaptionCue[] = []
  const speakerPrefix = buildSpeakerPrefix(
    speaker,
    previousSpeaker,
    config.includeSpeakerNames,
  )

  // Find first word with valid timing to use as starting point
  const firstValidWord = words.find(hasValidTiming)
  if (!firstValidWord || firstValidWord.start === undefined) {
    // No words have valid timing - skip highlighting entirely for this segment
    return []
  }

  let lastEndTime = firstValidWord.start

  for (let i = 0; i < words.length; i++) {
    const word = words[i]

    // Skip words without valid timing - they will appear in the segment text
    // but won't get their own highlighted cue
    if (!hasValidTiming(word)) {
      continue
    }

    // These are guaranteed defined by hasValidTiming
    const wordStart = word.start as number
    const wordEnd = word.end as number

    // Insert filler cue if there's a gap
    if (wordStart > lastEndTime) {
      cues.push({
        start: lastEndTime,
        end: wordStart,
        text: speakerPrefix + buildSegmentText(words),
      })
    }

    // Add highlighted cue
    cues.push({
      start: wordStart,
      end: wordEnd,
      text:
        speakerPrefix + buildHighlightedText(words, i, config.highlightWith),
    })

    lastEndTime = wordEnd
  }

  // Add final filler if segment has valid end and extends past last word
  if (
    hasValidSegmentTiming(segmentStart, segmentEnd) &&
    segmentEnd > lastEndTime
  ) {
    cues.push({
      start: lastEndTime,
      end: segmentEnd,
      text: speakerPrefix + buildSegmentText(words),
    })
  }

  return cues
}

/**
 * Generate a basic cue for a segment without word highlighting.
 */
function generateBasicCue(
  segment: WhisperxSegment,
  speaker: string | undefined,
  previousSpeaker: string | undefined,
  config: CaptionsConfig,
): CaptionCue {
  const speakerPrefix = buildSpeakerPrefix(
    speaker,
    previousSpeaker,
    config.includeSpeakerNames,
  )
  const text = escapeHtml(segment.text.trim())

  return {
    start: segment.start,
    end: segment.end,
    text: speakerPrefix + text,
  }
}

/**
 * Generate SubRip (SRT) format captions.
 *
 * SRT format:
 * 1
 * 00:00:00,000 --> 00:00:02,500
 * Luciano: Hello, welcome to the podcast.
 *
 * 2
 * 00:00:02,500 --> 00:00:05,000
 * Eoin: Thanks for having me!
 */
export function generateSrt(options: GeneratorOptions): string {
  const { transcript, config } = options
  const lines: string[] = []

  let cueNumber = 1
  let previousSpeaker: string | undefined

  for (const segment of transcript.segments) {
    const speaker = getSegmentSpeaker(segment)

    let cues: CaptionCue[]

    if (config.highlightWords && segment.words && segment.words.length > 0) {
      cues = generateHighlightedCues(
        segment.words,
        speaker,
        previousSpeaker,
        config,
        segment.start,
        segment.end,
      )
    } else {
      cues = [generateBasicCue(segment, speaker, previousSpeaker, config)]
    }

    for (const cue of cues) {
      lines.push(cueNumber.toString())
      lines.push(
        `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
      )
      lines.push(cue.text)
      lines.push('')
      cueNumber++
    }

    previousSpeaker = speaker
  }

  return lines.join('\n')
}
