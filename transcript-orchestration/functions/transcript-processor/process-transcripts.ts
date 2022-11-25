import { WhisperSegment, TranscribeSpeakerSegment, MergedTranscript } from './types'

type SpeakerChangeEntry = { speakerLabel: string, start: number }

/**
 * For a given timestamp, find who was speaking at that time
 * 
 * @param speakerChanges A list of speaker changes with timings and speaker identifiers
 * @param time A timestamp in seconds which may not match any exact speaker change time
 * @returns The nearest available speaker change prior to or on the specified time
 */
export function closestSpeakerChange(speakerChanges: SpeakerChangeEntry[], time: number): SpeakerChangeEntry | null {
  for (let i = speakerChanges.length - 1; i >= 0; i--) {
    const speakerChange = speakerChanges[i]
    if (speakerChange.start <= time) {
      return speakerChange
    }
  }
  // If the time is smaller than the start time of the first entry, default to the first speaker
  return speakerChanges[0]
}

/**
 * Process OpenAI Whisper transcription segments and AWS Transcribe to create a merged transcript
 * comprising the text segments from Whisper and the speaker identification from Transcribe.
 * 
 * @param whisperSegments 
 * @param transcribeSegments 
 */
export function merge(
  whisperSegments: WhisperSegment[],
  transcribeSegments: TranscribeSpeakerSegment[]): MergedTranscript {
  const speakerLabels = new Set<string>()

  // Reduce the Transcribe segments to those where the speaker changes
  const speakerChangeIndex = transcribeSegments.reduce<SpeakerChangeEntry[]>((acc, segment) => {
    let lastLabel = acc.length > 0 ? acc[acc.length - 1].speakerLabel : ''
    if (segment.speakerLabel !== lastLabel) {
      speakerLabels.add(segment.speakerLabel)
      acc.push({ speakerLabel: segment.speakerLabel, start: segment.start })
    }
    return acc
  }, [])

  // Add the latest speaker change to each whisper segment
  const segments = whisperSegments.map((segment) => {
    const latestSpeakerChange = closestSpeakerChange(speakerChangeIndex, segment.start)

    return {
      speakerLabel: latestSpeakerChange?.speakerLabel || 'unknown',
      ...segment
    }
  })

  // Since the Transcribe and Whisper segments do not match up, we sometimes have a speaker change in the middle
  // of a whisper segment. From observation, this usually is indicated by a segment ending mid-sentence.
  // We try and split that segment on the last sentence ending ('.', '!' or '?') and move the partial sentence 
  // into to the next segment.
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i]
    const nextSegment = segments[i + 1]
    if (currentSegment.speakerLabel !== nextSegment.speakerLabel && endsWithPartialSentence(currentSegment.text)) {
      const lastSepIndex = Math.max(...['.', '!', '?'].map(sep => currentSegment.text.lastIndexOf(sep)))
      const truncatedText = currentSegment.text.substring(0, lastSepIndex + 1)
      const remainingText = currentSegment.text.substring(lastSepIndex + 1, currentSegment.text.length)
      currentSegment.text = truncatedText
      nextSegment.text = remainingText + nextSegment.text
    }
  }

  // Having merged segments, we may have some empty text segment which we can remove
  const filteredSegments = segments.filter(segment => segment.text.trim().length > 0)

  const speakers : Record<string, string> = {}
  for (const speaker of speakerLabels) {
    speakers[speaker] = speaker
  }

  return {
    speakers,
    segments: filteredSegments
  }
}

function endsWithPartialSentence(text: string) {
  return !text.endsWith('?') && !text.endsWith('!') && !text.endsWith('.')
}