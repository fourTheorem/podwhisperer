import { describe, expect, it } from 'vitest'
import {
  CaptionsConfigSchema,
  LlmRefinementConfigSchema,
  NormalizationConfigSchema,
  PipelineConfigSchema,
  ReplacementRuleSchema,
  TranscriptionConfigSchema,
} from './index'

describe('TranscriptionConfigSchema', () => {
  it('populates defaults for empty object', () => {
    const result = TranscriptionConfigSchema.parse({})

    expect(result).toEqual({
      model: 'large-v2',
      language: 'en',
      minSpeakers: 1,
      maxSpeakers: undefined,
      jobTimeoutMinutes: 60,
      skipIfOutputExists: false,
      hfTokenSsmPath: '/podwhisperer/hf_token',
    })
  })

  it('allows overriding defaults', () => {
    const result = TranscriptionConfigSchema.parse({
      model: 'large-v3',
      language: 'es',
      minSpeakers: 2,
      maxSpeakers: 4,
      jobTimeoutMinutes: 120,
    })

    expect(result.model).toBe('large-v3')
    expect(result.language).toBe('es')
    expect(result.minSpeakers).toBe(2)
    expect(result.maxSpeakers).toBe(4)
    expect(result.jobTimeoutMinutes).toBe(120)
  })

  it('accepts custom model names', () => {
    const result = TranscriptionConfigSchema.parse({
      model: 'custom-model-v1',
    })

    expect(result.model).toBe('custom-model-v1')
  })

  it('allows overriding hfTokenSsmPath', () => {
    const result = TranscriptionConfigSchema.parse({
      hfTokenSsmPath: '/custom/path/hf_token',
    })

    expect(result.hfTokenSsmPath).toBe('/custom/path/hf_token')
  })
})

describe('NormalizationConfigSchema', () => {
  it('populates defaults for empty object', () => {
    const result = NormalizationConfigSchema.parse({})

    expect(result).toEqual({
      normalize: true,
      maxCharsPerSegment: 48,
      maxWordsPerSegment: 10,
      splitSegmentAtSpeakerChange: true,
      punctuationSplitThreshold: 0.7,
      punctuationChars: ['.', ',', '?', '!', ';', ':'],
    })
  })

  it('allows overriding defaults', () => {
    const result = NormalizationConfigSchema.parse({
      normalize: false,
      maxCharsPerSegment: 60,
    })

    expect(result.normalize).toBe(false)
    expect(result.maxCharsPerSegment).toBe(60)
    expect(result.punctuationChars).toEqual(['.', ',', '?', '!', ';', ':'])
  })
})

describe('CaptionsConfigSchema', () => {
  it('populates defaults for empty object', () => {
    const result = CaptionsConfigSchema.parse({})

    expect(result).toEqual({
      generateVtt: true,
      generateSrt: true,
      generateSimplifiedJson: true,
      highlightWords: false,
      highlightWith: 'underline',
      includeSpeakerNames: 'when-changes',
    })
  })

  it('allows overriding defaults', () => {
    const result = CaptionsConfigSchema.parse({
      generateVtt: false,
      highlightWith: 'bold',
      includeSpeakerNames: 'always',
    })

    expect(result.generateVtt).toBe(false)
    expect(result.generateSrt).toBe(true)
    expect(result.highlightWith).toBe('bold')
    expect(result.includeSpeakerNames).toBe('always')
  })
})

describe('PipelineConfigSchema', () => {
  it('populates nested defaults for empty object', () => {
    const result = PipelineConfigSchema.parse({})

    expect(result.transcription).toEqual({
      model: 'large-v2',
      language: 'en',
      minSpeakers: 1,
      maxSpeakers: undefined,
      jobTimeoutMinutes: 60,
      skipIfOutputExists: false,
      hfTokenSsmPath: '/podwhisperer/hf_token',
    })
    expect(result.replacementRules).toBeUndefined()
    expect(result.llmRefinement).toBeUndefined()
    expect(result.normalization).toEqual({
      normalize: true,
      maxCharsPerSegment: 48,
      maxWordsPerSegment: 10,
      splitSegmentAtSpeakerChange: true,
      punctuationSplitThreshold: 0.7,
      punctuationChars: ['.', ',', '?', '!', ';', ':'],
    })
    expect(result.captions).toEqual({
      generateVtt: true,
      generateSrt: true,
      generateSimplifiedJson: true,
      highlightWords: false,
      highlightWith: 'underline',
      includeSpeakerNames: 'when-changes',
    })
  })

  it('allows partial overrides of nested configs', () => {
    const result = PipelineConfigSchema.parse({
      transcription: { model: 'large-v3', language: 'es' },
      normalization: { maxCharsPerSegment: 100 },
      captions: { generateSrt: false },
    })

    expect(result.transcription.model).toBe('large-v3')
    expect(result.transcription.language).toBe('es')
    expect(result.transcription.minSpeakers).toBe(1)
    expect(result.normalization.maxCharsPerSegment).toBe(100)
    expect(result.normalization.normalize).toBe(true)
    expect(result.captions.generateSrt).toBe(false)
    expect(result.captions.generateVtt).toBe(true)
  })
})

describe('ReplacementRuleSchema', () => {
  it('validates regex type', () => {
    const result = ReplacementRuleSchema.parse({
      type: 'regex',
      search: '\\bfoo\\b',
      replacement: 'bar',
    })

    expect(result.type).toBe('regex')
    expect(result.search).toBe('\\bfoo\\b')
    expect(result.replacement).toBe('bar')
  })

  it('validates literal type', () => {
    const result = ReplacementRuleSchema.parse({
      type: 'literal',
      search: 'foo',
      replacement: 'bar',
    })

    expect(result.type).toBe('literal')
  })

  it('rejects invalid type', () => {
    expect(() =>
      ReplacementRuleSchema.parse({
        type: 'invalid',
        search: 'foo',
        replacement: 'bar',
      }),
    ).toThrow()
  })
})

describe('LlmRefinementConfigSchema', () => {
  it('should apply default modelConfig when not specified', () => {
    const input = { bedrockInferenceProfileId: 'test-model' }
    const result = LlmRefinementConfigSchema.parse(input)

    expect(result.modelConfig).toEqual({
      max_tokens: 64000,
      temperature: 0.2,
    })
  })

  it('should apply defaults for missing modelConfig fields', () => {
    const input = {
      bedrockInferenceProfileId: 'test-model',
      modelConfig: { max_tokens: 1000 },
    }
    const result = LlmRefinementConfigSchema.parse(input)

    expect(result.modelConfig.max_tokens).toBe(1000)
    expect(result.modelConfig.temperature).toBe(0.2)
  })

  it('should preserve extra modelConfig fields via passthrough', () => {
    const input = {
      bedrockInferenceProfileId: 'test-model',
      modelConfig: { top_p: 0.9 },
    }
    const result = LlmRefinementConfigSchema.parse(input)

    expect(result.modelConfig.top_p).toBe(0.9)
    expect(result.modelConfig.max_tokens).toBe(64000)
  })

  it('should accept additionalContext', () => {
    const input = {
      bedrockInferenceProfileId: 'test-model',
      additionalContext: 'This is a tech podcast about AWS.',
    }
    const result = LlmRefinementConfigSchema.parse(input)

    expect(result.additionalContext).toBe('This is a tech podcast about AWS.')
  })

  it('should make additionalContext optional', () => {
    const input = { bedrockInferenceProfileId: 'test-model' }
    const result = LlmRefinementConfigSchema.parse(input)

    expect(result.additionalContext).toBeUndefined()
  })
})
