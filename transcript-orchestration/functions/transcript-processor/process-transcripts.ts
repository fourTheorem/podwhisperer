import { WhisperSegment, TranscribeSpeakerSegment } from './types'

type MergedTranscriptSegment = {
  speakerLabel: string,
  start: number,
  end: number,
  text: string,
}

type MergedTranscript = {
  segments: MergedTranscriptSegment[],
  speakers: Record<string, string>
}

type SpeakerChangeEntry = { speakerLabel: string, start: number }

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

export function merge(
  whisperSegments: WhisperSegment[],
  transcribeSegments: TranscribeSpeakerSegment[]): MergedTranscript
{
  const speakerLabels = new Set<string>()

  const speakerChangeIndex = transcribeSegments.reduce<SpeakerChangeEntry[]>((acc, segment) => {
    let lastLabel = acc.length > 0 ? acc[acc.length - 1].speakerLabel : ''
    if (segment.speakerLabel !== lastLabel) {
      speakerLabels.add(segment.speakerLabel)
      acc.push({ speakerLabel: segment.speakerLabel, start: segment.start })
    }
    return acc
  }, [])

  const segments = whisperSegments.map((segment) => {
    const latestSpeakerChange = closestSpeakerChange(speakerChangeIndex, segment.start)

    return {
      speakerLabel: latestSpeakerChange?.speakerLabel || 'unknown',
      ...segment
    }
  })

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

  const speakers : Record<string, string> = {}
  for (const speaker of speakerLabels) {
    // TODO - use the actual speaker name for the value
    speakers[speaker] = speaker
  }

  return {
    speakers,
    segments
  }
}

function endsWithPartialSentence(text: string) {
  return !text.endsWith('?') && !text.endsWith('!') && !text.endsWith('.')
}