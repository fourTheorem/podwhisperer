import { WhisperSegment, TranscribeSpeakerSegment } from './types'

type MergedTranscriptSegment = {
  speakerLabel: string,
  start: number,
  end: number,
  text: string,
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
  transcribeSegments: TranscribeSpeakerSegment[]): MergedTranscriptSegment[]
{
  const speakerChangeIndex = transcribeSegments.reduce<SpeakerChangeEntry[]>((acc, segment) => {
    let lastLabel = acc.length > 0 ? acc[acc.length - 1].speakerLabel : ''
    if (segment.speakerLabel !== lastLabel) {
      acc.push({ speakerLabel: segment.speakerLabel, start: segment.start })
    }
    return acc
  }, [])

  return whisperSegments.map((segment) => {
    const latestSpeakerChange = closestSpeakerChange(speakerChangeIndex, segment.start)

    return {
      speakerLabel: latestSpeakerChange?.speakerLabel || 'unknown',
      ...segment
    }
  })
}