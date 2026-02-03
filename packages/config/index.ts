import { z } from 'zod'

/**
 * Schema for a replacement rule - either regex or literal string matching.
 */
export const ReplacementRuleSchema = z.discriminatedUnion('type', [
  z.object({
    /** Use regex pattern matching */
    type: z.literal('regex'),
    /** Regular expression pattern to match */
    search: z.string(),
    /** Text to replace matches with */
    replacement: z.string(),
  }),
  z.object({
    /** Use literal string matching */
    type: z.literal('literal'),
    /** Exact string to find */
    search: z.string(),
    /** Text to replace matches with */
    replacement: z.string(),
  }),
])

/**
 * A rule for replacing text in the transcript.
 * Can be either a regex pattern or a literal string match.
 */
export type ReplacementRule = z.infer<typeof ReplacementRuleSchema>

/**
 * Schema for validating LLM correction suggestions.
 * These thresholds help reject corrections that are too aggressive (full rewrites).
 */
export const SuggestionValidationConfigSchema = z.object({
  /** Whether validation is enabled (default: true) */
  enabled: z.boolean().default(true),
  /** Maximum allowed percentage of words changed, 0-1 (default: 0.4 = 40%) */
  maxWordChangeRatio: z.number().default(0.4),
  /** Maximum normalized edit distance, 0-1 (default: 0.5 = 50%) */
  maxNormalizedEditDistance: z.number().default(0.5),
  /** Maximum consecutive word changes allowed (default: 3) */
  maxConsecutiveChanges: z.number().default(3),
  /** Minimum words for ratio checks to apply (default: 5) */
  minWordsForRatioCheck: z.number().default(5),
})

/**
 * Configuration for validating LLM correction suggestions.
 */
export type SuggestionValidationConfig = z.infer<
  typeof SuggestionValidationConfigSchema
>

/**
 * Schema for LLM-based refinement of transcripts.
 */
export const LlmRefinementConfigSchema = z.object({
  /** Optional additional context to help the LLM understand domain-specific terms */
  additionalContext: z.string().optional(),
  /** The inference profile ID to use for refinement. Eg: "eu.anthropic.claude-sonnet-4-20250514-v1:0" */
  bedrockInferenceProfileId: z.string(),
  /** Model configuration parameters for the Bedrock InvokeModel request */
  modelConfig: z
    .object({
      max_tokens: z.number().default(64000),
      temperature: z.number().default(0.2),
    })
    .loose()
    .default({ max_tokens: 64000, temperature: 0.2 }),
  /** Optional validation config for suggestion acceptance */
  suggestionValidation: SuggestionValidationConfigSchema.optional(),
})

/**
 * Configuration for LLM-based refinement of transcripts.
 */
export type LlmRefinementConfig = z.infer<typeof LlmRefinementConfigSchema>

/**
 * Schema for transcript normalization configuration.
 */
export const NormalizationConfigSchema = z.object({
  /** Whether the normalization step is applied (default: true) */
  normalize: z.boolean().default(true),
  /** Maximum characters per caption segment (default: 48) */
  maxCharsPerSegment: z.number().default(48),
  /** Maximum words per caption segment (default: 10) */
  maxWordsPerSegment: z.number().default(10),
  /** Whether to force a split when speaker changes within a segment (default: true) */
  splitSegmentAtSpeakerChange: z.boolean().default(true),
  /**
   * Threshold (0-1) for splitting at punctuation.
   * When closer to limit >= this threshold and word ends with punctuation, split after it.
   * (default: 0.7 = 70%)
   */
  punctuationSplitThreshold: z.number().default(0.7),
  /** Characters that can end a caption segment (default: ['.', ',', '?', '!', ';', ':']) */
  punctuationChars: z.array(z.string()).default(['.', ',', '?', '!', ';', ':']),
})

/**
 * Configuration for transcript normalization.
 */
export type NormalizationConfig = z.infer<typeof NormalizationConfigSchema>

/**
 * Schema for caption generation configuration.
 */
export const CaptionsConfigSchema = z.object({
  /** Generate WebVTT format captions (default: true) */
  generateVtt: z.boolean().default(true),
  /** Generate SRT format captions (default: true) */
  generateSrt: z.boolean().default(true),
  /** Generate a simplified JSON format captions (default: true) */
  generateSimplifiedJson: z.boolean().default(true),
  /** In SRT and VTT formats, if true, will generate a line for each word, highlighting/underlining the current one (default: false) */
  highlightWords: z.boolean().default(false),
  /** If `highlightWords` is true, choose how to highlight the current word (default: 'underline')
      NOTE: using bold or italic might cause text shift in captions making it harder to read.
  */
  highlightWith: z.enum(['underline', 'bold', 'italic']).default('underline'),
  /** In SRT and VTT formats, include speaker names in caption lines (default: 'when-changes')
      Possible values:
        - `'never'`: never add them
        - `'always'`: in every single line
        - `'when-changes'`: only when the speaker changes
  */
  includeSpeakerNames: z
    .enum(['never', 'always', 'when-changes'])
    .default('when-changes'),
})

/**
 * Configuration for caption generation.
 */
export type CaptionsConfig = z.infer<typeof CaptionsConfigSchema>

/**
 * Known Whisper model names.
 * Using z.union with literals + z.string() allows known models with autocomplete
 * while still accepting custom/future model names.
 */
export const WhisperModelNameSchema = z.union([
  z.literal('tiny.en'),
  z.literal('tiny'),
  z.literal('base.en'),
  z.literal('base'),
  z.literal('small.en'),
  z.literal('small'),
  z.literal('medium.en'),
  z.literal('medium'),
  z.literal('large-v1'),
  z.literal('large-v2'),
  z.literal('large-v3'),
  z.string(),
])

export type WhisperModelName = z.infer<typeof WhisperModelNameSchema>

/**
 * Schema for WhisperX transcription configuration.
 */
export const TranscriptionConfigSchema = z.object({
  /** Whisper model name (default: "large-v2") */
  model: WhisperModelNameSchema.default('large-v2'),
  /** Language code for transcription (default: "en") */
  language: z.string().default('en'),
  /** Minimum number of speakers for diarization (default: 1) */
  minSpeakers: z.number().default(1),
  /** Maximum number of speakers for diarization (default: undefined = auto-detect) */
  maxSpeakers: z.number().optional(),
  /** Timeout in minutes for transcription jobs (default: 60, max: 720 due to SQS limit) */
  jobTimeoutMinutes: z.number().max(720).default(60),
  /** If true, skips transcription if output already exists (default: false) */
  skipIfOutputExists: z.boolean().default(false),
  /** SSM parameter path for HuggingFace token (default: '/podwhisperer/hf_token') */
  hfTokenSsmPath: z.string().default('/podwhisperer/hf_token'),
})

export type TranscriptionConfig = z.infer<typeof TranscriptionConfigSchema>

/** Default values for TranscriptionConfig */
const transcriptionDefaults: TranscriptionConfig = {
  model: 'large-v2',
  language: 'en',
  minSpeakers: 1,
  maxSpeakers: undefined,
  jobTimeoutMinutes: 60,
  skipIfOutputExists: false,
  hfTokenSsmPath: '/podwhisperer/hf_token',
}

/** Default values for NormalizationConfig */
const normalizationDefaults: NormalizationConfig = {
  normalize: true,
  maxCharsPerSegment: 48,
  maxWordsPerSegment: 10,
  splitSegmentAtSpeakerChange: true,
  punctuationSplitThreshold: 0.7,
  punctuationChars: ['.', ',', '?', '!', ';', ':'],
}

/** Default values for CaptionsConfig */
const captionsDefaults: CaptionsConfig = {
  generateVtt: true,
  generateSrt: true,
  generateSimplifiedJson: true,
  highlightWords: false,
  highlightWith: 'underline',
  includeSpeakerNames: 'when-changes',
}

/**
 * Schema for EventBridge notification configuration.
 */
export const NotificationConfigSchema = z.object({
  /** Whether to send completion notification (default: true) */
  enabled: z.boolean().default(true),
  /** EventBridge event bus name (default: "default") */
  eventBusName: z.string().default('default'),
  /** Event source identifier (default: "podwhisperer.pipeline") */
  source: z.string().default('podwhisperer.pipeline'),
  /** Event detail type (default: "Pipeline Completed") */
  detailType: z.string().default('Pipeline Completed'),
})

/**
 * Configuration for EventBridge notifications.
 */
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>

/** Default values for NotificationConfig */
const notificationDefaults: NotificationConfig = {
  enabled: true,
  eventBusName: 'default',
  source: 'podwhisperer.pipeline',
  detailType: 'Pipeline Completed',
}

/**
 * Schema for the post-transcription pipeline configuration.
 */
export const PipelineConfigSchema = z.object({
  /** STEP 0: Transcription settings for WhisperX */
  transcription: TranscriptionConfigSchema.optional().transform((val) => ({
    ...transcriptionDefaults,
    ...val,
  })),

  /** STEP 1 (OPTIONAL): Replacement rules for text substitution in transcripts */
  replacementRules: z.array(ReplacementRuleSchema).optional(),

  /** STEP 2 (OPTIONAL): LLM-based refinement of the current transcript via Bedrock */
  llmRefinement: LlmRefinementConfigSchema.optional(),

  /** STEP 3: Normalization: makes sure the transcript is properly segmented so each segment is readable enough */
  normalization: NormalizationConfigSchema.optional().transform((val) => ({
    ...normalizationDefaults,
    ...val,
  })),

  /** STEP 4: Caption generation settings */
  captions: CaptionsConfigSchema.optional().transform((val) => ({
    ...captionsDefaults,
    ...val,
  })),

  /** STEP 5: EventBridge notification on pipeline completion */
  notification: NotificationConfigSchema.optional().transform((val) => ({
    ...notificationDefaults,
    ...val,
  })),
})

/**
 * Configuration for the post-transcription pipeline.
 */
export type PipelineConfigProcessed = z.infer<typeof PipelineConfigSchema>
export type PipelineConfig = z.input<typeof PipelineConfigSchema>

/**
 * Allows to easily define a PipelineConfig object with proper typing (even with just JavaScript).
 * @param {PipelineConfig} config - The pipeline configuration object
 * @returns {PipelineConfig}
 */
export function defineConfig(config: PipelineConfig): PipelineConfig {
  return config
}
