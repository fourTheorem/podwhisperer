/**
 * Job message sent to SQS queue.
 * Contains only the S3 key - whisper config is read from container env vars.
 */
export interface TranscriptionJob {
  /** S3 object key (e.g., "input/audio.mp3") */
  s3_key: string
  /** Callback ID for durable execution callback */
  callback_id: string
}

/** All possible processing steps from WhisperX worker */
export type ProcessingStep =
  | 'download_s3'
  | 'validate_audio'
  | 'convert_to_wav'
  | 'load_whisper_model'
  | 'load_audio'
  | 'transcription'
  | 'load_align_model'
  | 'alignment'
  | 'load_diarize_model'
  | 'diarization'
  | 'upload_raw_transcript'

/** Status of a processing step */
export type StepStatus = 'success' | 'error' | 'skipped'

/** Timing information for a single processing step */
export interface StepTiming {
  /** Which processing step this timing is for */
  step: ProcessingStep
  /** Whether the step succeeded, failed, or was skipped */
  status: StepStatus
  /** Duration in milliseconds */
  duration_ms: number
  /** ISO 8601 timestamp when step started */
  start_time: string
  /** ISO 8601 timestamp when step ended */
  end_time: string
}

/** Result sent back via callback when job completes */
export interface TranscriptionResult {
  /** S3 key for the raw transcript file */
  rawTranscriptKey: string
  /** Ordered array of timing stats for each processing step */
  stats: StepTiming[]
}

// =============================================================================
// WhisperX types (raw output from WhisperX transcription)
// =============================================================================

/** A single word from WhisperX output */
export interface WhisperxWord {
  /** The word text */
  word: string
  /** Start time in seconds (optional - WhisperX can't always detect timing) */
  start?: number
  /** End time in seconds (optional - WhisperX can't always detect timing) */
  end?: number
  /** Speaker label (e.g., "SPEAKER_00") */
  speaker?: string
  /** Confidence score from WhisperX, null if timing was manually adjusted */
  score?: number | null
}

/** A segment from WhisperX output */
export interface WhisperxSegment {
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
  /** Full text of the segment */
  text: string
  /** Speaker label (e.g., "SPEAKER_00") */
  speaker?: string
  /** Word-level timing data */
  words?: WhisperxWord[]
}

/** WhisperX raw transcription result */
export interface WhisperxResult {
  /** Array of transcription segments */
  segments: WhisperxSegment[]
}

// =============================================================================
// Caption types (processed format for display/editing)
// =============================================================================

/** A single caption segment */
export interface CaptionSegment {
  /** Shortened speaker label (e.g., "spk_0") */
  speakerLabel: string
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
  /** Caption text */
  text: string
}

/** Captions result with speaker mapping */
export interface CaptionsResult {
  /** Map of short speaker labels to display names */
  speakers: Record<string, string>
  /** Array of caption segments */
  segments: CaptionSegment[]
}

/** A single update from the LLM */
export interface LlmRefinementUpdate {
  /** Text before correction */
  originalText: string
  /** Text after correction */
  correctedText: string
}

/** Reasons a suggestion can be ignored */
export type SuggestionIgnoreReason =
  | 'no-change' // originalText === correctedText
  | 'word-change-ratio' // >maxWordChangeRatio of words changed
  | 'edit-distance' // >maxNormalizedEditDistance
  | 'consecutive-changes' // >maxConsecutiveChanges consecutive words changed

/** An ignored/rejected suggestion from the LLM */
export interface IgnoredSuggestion {
  /** Text before correction */
  originalText: string
  /** Text the LLM suggested */
  correctedText: string
  /** Why this suggestion was ignored */
  ignoreReason: SuggestionIgnoreReason
}

/** Statistics from the LLM refinement process */
export interface LlmRefinementStats {
  /** Total segments in transcript */
  segmentsProcessed: number
  /** Segments that received corrections */
  segmentsUpdated: number
  /** Number of speakers mapped to names */
  speakersIdentified: number
  /** Original speaker mapping (e.g., { SPEAKER_00: 'Luciano' }) */
  speakerMapping: Record<string, string>
  /** List of all corrections applied */
  updates: LlmRefinementUpdate[]
  /** List of suggestions that were ignored (with reasons) */
  ignoredSuggestions: IgnoredSuggestion[]
  /** Time for Bedrock API call in milliseconds */
  llmResponseTimeMs: number
}
