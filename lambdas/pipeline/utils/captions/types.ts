import type { CaptionsConfig } from '@podwhisperer/config'
import type { WhisperxResult } from '../../types'

/**
 * Options passed to caption generators.
 */
export interface GeneratorOptions {
  /** The normalized transcript with word-level timing */
  transcript: WhisperxResult
  /** Caption configuration options */
  config: CaptionsConfig
}

/**
 * A single caption cue with timing and text.
 * Used internally during caption generation.
 */
export interface CaptionCue {
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
  /** The text content (may include speaker prefix and highlighting) */
  text: string
}
