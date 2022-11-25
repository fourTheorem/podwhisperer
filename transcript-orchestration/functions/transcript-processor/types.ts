export type WhisperSegment = {
  start: number, // 55.76
  end: number,   // 60.72
  text: string   // ' Hello everyone and welcome to our podcast.'
}

export type TranscribeSpeakerSegment = {
  speakerLabel: string, // spk_0
  start: number, // 204.62
  end: number, // 218.55
}

export type MergedTranscriptSegment = {
  speakerLabel: string,
  start: number,
  end: number,
  text: string,
}

export type MergedTranscript = {
  segments: MergedTranscriptSegment[],
  speakers: Record<string, string>
}