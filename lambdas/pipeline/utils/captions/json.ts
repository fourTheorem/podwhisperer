import type { WhisperxResult, WhisperxSegment } from '../../types'
import type { GeneratorOptions } from './types'

/**
 * Simplified JSON caption segment.
 */
interface JsonCaptionSegment {
  speakerLabel: string
  start: number
  end: number
  text: string
}

/**
 * Simplified JSON captions result.
 */
interface JsonCaptionsResult {
  speakers: Record<string, string>
  segments: JsonCaptionSegment[]
}

/**
 * Extract all unique speakers from the transcript.
 * Scans both segment-level and word-level speaker values.
 */
function extractSpeakers(transcript: WhisperxResult): Set<string> {
  const speakers = new Set<string>()

  for (const segment of transcript.segments) {
    if (segment.speaker) {
      speakers.add(segment.speaker)
    }
    if (segment.words) {
      for (const word of segment.words) {
        if (word.speaker) {
          speakers.add(word.speaker)
        }
      }
    }
  }

  return speakers
}

/**
 * Create a mapping from original speaker names to short labels.
 * E.g., "Luciano" -> "spk_0", "SPEAKER_00" -> "spk_0"
 */
function createSpeakerMapping(
  speakers: Set<string>,
): Record<string, { label: string; displayName: string }> {
  const mapping: Record<string, { label: string; displayName: string }> = {}
  const sortedSpeakers = Array.from(speakers).sort()

  sortedSpeakers.forEach((speaker, index) => {
    mapping[speaker] = {
      label: `spk_${index}`,
      displayName: speaker,
    }
  })

  return mapping
}

/**
 * Get the effective speaker for a segment.
 * Falls back to 'SPEAKER_00' if no speaker is found.
 */
function getSegmentSpeaker(segment: WhisperxSegment): string {
  if (segment.speaker) {
    return segment.speaker
  }
  // Try to get speaker from first word
  if (segment.words && segment.words.length > 0 && segment.words[0].speaker) {
    return segment.words[0].speaker
  }
  return 'SPEAKER_00'
}

/**
 * Generate simplified JSON format captions.
 *
 * Output format:
 * {
 *   "speakers": { "spk_0": "Luciano", "spk_1": "Eoin" },
 *   "segments": [
 *     { "speakerLabel": "spk_0", "start": 0, "end": 2.5, "text": "Hello, welcome..." }
 *   ]
 * }
 */
export function generateJson(options: GeneratorOptions): string {
  const { transcript } = options

  // Extract unique speakers and create mapping
  const speakersSet = extractSpeakers(transcript)

  // If no speakers found, add a default one
  if (speakersSet.size === 0) {
    speakersSet.add('SPEAKER_00')
  }

  const speakerMapping = createSpeakerMapping(speakersSet)

  // Build the speakers object for output
  const speakers: Record<string, string> = {}
  for (const [_originalName, { label, displayName }] of Object.entries(
    speakerMapping,
  )) {
    speakers[label] = displayName
  }

  // Convert segments
  const segments: JsonCaptionSegment[] = transcript.segments.map((segment) => {
    const originalSpeaker = getSegmentSpeaker(segment)
    const mapping = speakerMapping[originalSpeaker] || {
      label: 'spk_0',
      displayName: originalSpeaker,
    }

    return {
      speakerLabel: mapping.label,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
    }
  })

  const result: JsonCaptionsResult = { speakers, segments }
  return JSON.stringify(result, null, 2)
}
