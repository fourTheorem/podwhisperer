import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { describe, expect, it, vi } from 'vitest'
import type { WhisperxSegment } from '../types'
import {
  llmRefinement,
  reconcileSegment,
  reconstructText,
  textToWords,
} from './llm-refinement'

describe('reconcileSegment', () => {
  const makeSegment = (words: Array<{ word: string }>): WhisperxSegment => ({
    start: 0.0,
    end: 3.0,
    text: words.map((w) => w.word).join(' '),
    speaker: 'SPEAKER_01',
    words: words.map((w, i) => ({
      word: w.word,
      start: i * 1.0,
      end: (i + 1) * 1.0,
      score: 0.9,
      speaker: 'SPEAKER_01',
    })),
  })

  it('handles same word count (simple replacement)', () => {
    const segment = makeSegment([{ word: 'hello' }, { word: 'world' }])
    const patched = ['hello', 'universe']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(2)
    expect(segment.words?.[0].word).toBe('hello')
    expect(segment.words?.[1].word).toBe('universe')
    expect(segment.words?.[0].start).toBe(0.0)
    expect(segment.words?.[1].start).toBe(1.0)
    expect(segment.text).toBe('hello universe')
  })

  it('handles word removal (merge with previous)', () => {
    const segment = makeSegment([
      { word: 'sage' },
      { word: 'maker' },
      { word: 'rocks' },
    ])
    const patched = ['SageMaker', 'rocks']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(2)
    expect(segment.words?.[0].word).toBe('SageMaker')
    expect(segment.words?.[0].start).toBe(0.0)
    expect(segment.words?.[0].end).toBe(2.0) // Extended to cover 'maker'
    expect(segment.words?.[0].score).toBe(null) // Adjusted
    expect(segment.words?.[1].word).toBe('rocks')
    expect(segment.words?.[1].start).toBe(2.0)
    expect(segment.text).toBe('SageMaker rocks')
  })

  it('handles word removal at start (merge with next)', () => {
    const segment = makeSegment([
      { word: 'um' },
      { word: 'hello' },
      { word: 'world' },
    ])
    const patched = ['hello', 'world']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(2)
    expect(segment.words?.[0].word).toBe('hello')
    expect(segment.words?.[0].start).toBe(0.0) // Extended backward to cover 'um'
    expect(segment.words?.[0].score).toBe(null)
    expect(segment.words?.[1].word).toBe('world')
    expect(segment.text).toBe('hello world')
  })

  it('handles word addition (split previous timing)', () => {
    const segment = makeSegment([
      { word: 'maxconcurrency' },
      { word: 'setting' },
    ])
    const patched = ['max', 'concurrency', 'setting']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(3)
    expect(segment.words?.[0].word).toBe('max')
    expect(segment.words?.[0].start).toBe(0.0)
    expect(segment.words?.[0].end).toBe(0.5) // Split
    expect(segment.words?.[0].score).toBe(null)
    expect(segment.words?.[1].word).toBe('concurrency')
    expect(segment.words?.[1].start).toBe(0.5)
    expect(segment.words?.[1].end).toBe(1.0)
    expect(segment.words?.[1].score).toBe(null)
    expect(segment.words?.[2].word).toBe('setting')
    expect(segment.text).toBe('max concurrency setting')
  })

  it('handles word addition at start (split next timing)', () => {
    const segment = makeSegment([{ word: 'hello' }, { word: 'world' }])
    const patched = ['oh', 'hello', 'world']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(3)
    expect(segment.words?.[0].word).toBe('oh')
    expect(segment.words?.[0].start).toBe(0.0) // Uses segment start
    expect(segment.words?.[0].score).toBe(null)
    expect(segment.words?.[1].word).toBe('hello')
    expect(segment.words?.[2].word).toBe('world')
    expect(segment.text).toBe('oh hello world')
  })

  it('handles multiple consecutive removals', () => {
    const segment = makeSegment([
      { word: 'a' },
      { word: 'b' },
      { word: 'c' },
      { word: 'd' },
    ])
    const patched = ['a', 'd']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(2)
    expect(segment.words?.[0].word).toBe('a')
    expect(segment.words?.[0].end).toBe(3.0) // Extended to cover b and c
    expect(segment.words?.[1].word).toBe('d')
    expect(segment.text).toBe('a d')
  })

  it('handles multiple consecutive additions', () => {
    const segment = makeSegment([{ word: 'hello' }])
    const patched = ['hello', 'beautiful', 'world']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(3)
    expect(segment.words?.[0].word).toBe('hello')
    expect(segment.words?.[1].word).toBe('beautiful')
    expect(segment.words?.[2].word).toBe('world')
    expect(segment.text).toBe('hello beautiful world')
  })

  it('handles mixed operations', () => {
    const segment = makeSegment([
      { word: 'I' },
      { word: 'um' },
      { word: 'like' },
      { word: 'sage' },
      { word: 'maker' },
    ])
    const patched = ['I', 'really', 'like', 'SageMaker']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(4)
    expect(segment.words?.map((w) => w.word)).toEqual([
      'I',
      'really',
      'like',
      'SageMaker',
    ])
    expect(segment.text).toBe('I really like SageMaker')
  })

  it('preserves speaker field on words', () => {
    const segment = makeSegment([{ word: 'hello' }])
    const patched = ['hello']

    reconcileSegment(segment, patched)

    expect(segment.words?.[0].speaker).toBe('SPEAKER_01')
  })

  it('sets score to null on adjusted words', () => {
    const segment = makeSegment([{ word: 'sage' }, { word: 'maker' }])
    const patched = ['SageMaker']

    reconcileSegment(segment, patched)

    expect(segment.words?.[0].score).toBe(null)
  })

  it('handles single word replacement main -> min (same word count)', () => {
    const segment = makeSegment([
      { word: 'set' },
      { word: 'the' },
      { word: 'main' },
      { word: 'execution' },
      { word: 'environment' },
    ])
    const patched = ['set', 'the', 'min', 'execution', 'environment']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(5)
    expect(segment.words?.[0].word).toBe('set')
    expect(segment.words?.[1].word).toBe('the')
    expect(segment.words?.[2].word).toBe('min')
    expect(segment.words?.[3].word).toBe('execution')
    expect(segment.words?.[4].word).toBe('environment')
    expect(segment.text).toBe('set the min execution environment')
  })

  it('handles single word replacement with filler removal', () => {
    const segment = makeSegment([
      { word: 'set' },
      { word: 'the' },
      { word: 'um' },
      { word: 'main' },
      { word: 'execution' },
    ])
    const patched = ['set', 'the', 'min', 'execution']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(4)
    expect(segment.words?.[0].word).toBe('set')
    expect(segment.words?.[1].word).toBe('the')
    expect(segment.words?.[2].word).toBe('min')
    expect(segment.words?.[3].word).toBe('execution')
    expect(segment.text).toBe('set the min execution')
  })

  it('handles replacement with filler before', () => {
    const segment = makeSegment([
      { word: 'set' },
      { word: 'the' },
      { word: 'main' },
      { word: 'um' },
      { word: 'execution' },
    ])
    const patched = ['set', 'the', 'min', 'execution']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(4)
    expect(segment.words?.[0].word).toBe('set')
    expect(segment.words?.[1].word).toBe('the')
    expect(segment.words?.[2].word).toBe('min')
    expect(segment.words?.[3].word).toBe('execution')
    expect(segment.text).toBe('set the min execution')
  })

  it('handles complex scenario: minimum -> min with surrounding changes', () => {
    const segment = makeSegment([
      { word: 'the' },
      { word: 'minimum' },
      { word: 'execution' },
    ])
    const patched = ['the', 'min', 'execution']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(3)
    expect(segment.words?.[0].word).toBe('the')
    expect(segment.words?.[1].word).toBe('min')
    expect(segment.words?.[2].word).toBe('execution')
    expect(segment.text).toBe('the min execution')
  })

  it('handles exact user scenario with real timing data', () => {
    const segment: WhisperxSegment = {
      start: 1572.336,
      end: 1578.0,
      text: 'when you set the main execution environment to zero',
      speaker: 'SPEAKER_01',
      words: [
        {
          word: 'when',
          start: 1572.336,
          end: 1572.436,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'you',
          start: 1572.476,
          end: 1572.576,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'set',
          start: 1572.616,
          end: 1572.716,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'the',
          start: 1572.756,
          end: 1572.856,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'main',
          start: 1572.896,
          end: 1572.996,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'execution',
          start: 1573.036,
          end: 1573.236,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'environment',
          start: 1573.276,
          end: 1573.576,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'to',
          start: 1573.616,
          end: 1573.716,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'zero',
          start: 1573.756,
          end: 1573.956,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
      ],
    }
    const patched = [
      'when',
      'you',
      'set',
      'the',
      'min',
      'execution',
      'environment',
      'to',
      'zero',
    ]

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(9)
    expect(segment.words?.[4].word).toBe('min')
    expect(segment.text).toBe(
      'when you set the min execution environment to zero',
    )
  })

  it('handles text/words mismatch - uses words array as source of truth', () => {
    const segment: WhisperxSegment = {
      start: 1572.336,
      end: 1578.0,
      // TEXT says "min" but WORDS array has "main"!
      text: 'when you set the min execution environment to zero',
      speaker: 'SPEAKER_01',
      words: [
        {
          word: 'when',
          start: 1572.336,
          end: 1572.436,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'you',
          start: 1572.476,
          end: 1572.576,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'set',
          start: 1572.616,
          end: 1572.716,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'the',
          start: 1572.756,
          end: 1572.856,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'main',
          start: 1572.896,
          end: 1572.996,
          score: 0.9,
          speaker: 'SPEAKER_01',
        }, // Still "main"!
        {
          word: 'execution',
          start: 1573.036,
          end: 1573.236,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'environment',
          start: 1573.276,
          end: 1573.576,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'to',
          start: 1573.616,
          end: 1573.716,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
        {
          word: 'zero',
          start: 1573.756,
          end: 1573.956,
          score: 0.9,
          speaker: 'SPEAKER_01',
        },
      ],
    }
    const patched = [
      'when',
      'you',
      'set',
      'the',
      'min',
      'execution',
      'environment',
      'to',
      'zero',
    ]

    reconcileSegment(segment, patched)

    expect(segment.words?.[4].word).toBe('min')
    expect(segment.text).toBe(
      'when you set the min execution environment to zero',
    )
  })

  it('handles segment without words array - only updates text', () => {
    const segment: WhisperxSegment = {
      start: 0.0,
      end: 3.0,
      text: 'hello world',
      speaker: 'SPEAKER_01',
    }
    const patched = ['hello', 'universe']

    reconcileSegment(segment, patched)

    expect(segment.words).toBeUndefined()
    expect(segment.text).toBe('hello universe')
  })

  it('handles segment with empty words array - only updates text', () => {
    const segment: WhisperxSegment = {
      start: 0.0,
      end: 3.0,
      text: 'hello world',
      speaker: 'SPEAKER_01',
      words: [],
    }
    const patched = ['hello', 'universe']

    reconcileSegment(segment, patched)

    expect(segment.words).toEqual([])
    expect(segment.text).toBe('hello universe')
  })
})

describe('reconstructText', () => {
  it('joins words with spaces', () => {
    expect(reconstructText(['hello', 'world'])).toBe('hello world')
  })

  it('handles empty array', () => {
    expect(reconstructText([])).toBe('')
  })

  it('handles single word', () => {
    expect(reconstructText(['hello'])).toBe('hello')
  })

  it('trims leading and trailing whitespace', () => {
    expect(reconstructText([' hello', 'world '])).toBe('hello world')
  })
})

describe('textToWords', () => {
  it('splits text by whitespace', () => {
    expect(textToWords('hello world')).toEqual(['hello', 'world'])
  })

  it('handles multiple spaces', () => {
    expect(textToWords('hello   world')).toEqual(['hello', 'world'])
  })

  it('handles tabs and newlines', () => {
    expect(textToWords('hello\tworld\nfoo')).toEqual(['hello', 'world', 'foo'])
  })

  it('preserves punctuation attached to words', () => {
    expect(textToWords("Hello, world! How's it going?")).toEqual([
      'Hello,',
      'world!',
      "How's",
      'it',
      'going?',
    ])
  })

  it('handles empty string', () => {
    expect(textToWords('')).toEqual([])
  })

  it('handles string with only whitespace', () => {
    expect(textToWords('   ')).toEqual([])
  })

  it('handles leading and trailing whitespace', () => {
    expect(textToWords('  hello world  ')).toEqual(['hello', 'world'])
  })
})

describe('llmRefinement integration', () => {
  const createMockBedrockClient = (responseJson: unknown) => {
    const mockSend = vi.fn().mockResolvedValue({
      body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(responseJson) }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      },
    })
    return { send: mockSend } as unknown as BedrockRuntimeClient
  }

  const defaultConfig = {
    bedrockModelId: 'test-model',
    modelConfig: { max_tokens: 64000, temperature: 0.3 },
  }

  it('returns empty stats for empty transcript', async () => {
    const mockClient = createMockBedrockClient({})
    const transcript = { segments: [] }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.segmentsProcessed).toBe(0)
    expect(stats.segmentsUpdated).toBe(0)
    expect(mockClient.send).not.toHaveBeenCalled()
  })

  it('applies speaker mapping to segments and words', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {
        SPEAKER_00: 'Alice',
        SPEAKER_01: 'Bob',
      },
      updates: [],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 2.0,
          text: 'hello',
          speaker: 'SPEAKER_00',
          words: [
            { word: 'hello', start: 0.0, end: 2.0, speaker: 'SPEAKER_00' },
          ],
        },
        {
          start: 2.0,
          end: 4.0,
          text: 'world',
          speaker: 'SPEAKER_01',
          words: [
            { word: 'world', start: 2.0, end: 4.0, speaker: 'SPEAKER_01' },
          ],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.speakersIdentified).toBe(2)
    expect(stats.speakerMapping).toEqual({
      SPEAKER_00: 'Alice',
      SPEAKER_01: 'Bob',
    })
    expect(transcript.segments[0].speaker).toBe('Alice')
    expect(transcript.segments[0].words?.[0].speaker).toBe('Alice')
    expect(transcript.segments[1].speaker).toBe('Bob')
    expect(transcript.segments[1].words?.[0].speaker).toBe('Bob')
  })

  it('applies text updates with timing reconciliation', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [{ idx: 0, text: 'SageMaker rocks' }],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 3.0,
          text: 'sage maker rocks',
          speaker: 'SPEAKER_00',
          words: [
            {
              word: 'sage',
              start: 0.0,
              end: 1.0,
              score: 0.9,
              speaker: 'SPEAKER_00',
            },
            {
              word: 'maker',
              start: 1.0,
              end: 2.0,
              score: 0.9,
              speaker: 'SPEAKER_00',
            },
            {
              word: 'rocks',
              start: 2.0,
              end: 3.0,
              score: 0.9,
              speaker: 'SPEAKER_00',
            },
          ],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.segmentsUpdated).toBe(1)
    expect(stats.ignoredSuggestions).toHaveLength(0)
    expect(stats.updates).toHaveLength(1)
    expect(stats.updates[0]).toEqual({
      originalText: 'sage maker rocks',
      correctedText: 'SageMaker rocks',
    })
    expect(transcript.segments[0].words?.length).toBe(2)
    expect(transcript.segments[0].words?.[0].word).toBe('SageMaker')
    expect(transcript.segments[0].words?.[0].end).toBe(2.0)
    expect(transcript.segments[0].text).toBe('SageMaker rocks')
  })

  it('skips invalid segment indices', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [
        { idx: -1, text: 'invalid' },
        { idx: 100, text: 'also invalid' },
        { idx: 0, text: 'valid update' },
      ],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 2.0,
          text: 'original',
          speaker: 'SPEAKER_00',
          words: [{ word: 'original', start: 0.0, end: 2.0 }],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.segmentsUpdated).toBe(1)
    expect(transcript.segments[0].text).toBe('valid update')
  })

  it('handles LLM response with no JSON', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            content: [
              { type: 'text', text: 'This response has no JSON structure.' },
            ],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      },
    })
    const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 2.0,
          text: 'original',
          speaker: 'SPEAKER_00',
          words: [{ word: 'original', start: 0.0, end: 2.0 }],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.segmentsUpdated).toBe(0)
    expect(stats.speakersIdentified).toBe(0)
    expect(transcript.segments[0].text).toBe('original')
  })

  it('tracks LLM response time', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [],
    })

    const transcript = {
      segments: [
        { start: 0.0, end: 2.0, text: 'hello', speaker: 'SPEAKER_00' },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.llmResponseTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('uses custom model config when provided', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      },
    })
    const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient

    const transcript = {
      segments: [
        { start: 0.0, end: 2.0, text: 'hello', speaker: 'SPEAKER_00' },
      ],
    }

    const config = {
      ...defaultConfig,
      modelConfig: {
        max_tokens: 1000,
        temperature: 0.5,
      },
    }

    await llmRefinement(transcript, config, mockClient)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const callArg = mockSend.mock.calls[0][0]
    const body = JSON.parse(callArg.input.body)
    expect(body.max_tokens).toBe(1000)
    expect(body.temperature).toBe(0.5)
  })

  it('includes additional context in prompt when provided', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      },
    })
    const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient

    const transcript = {
      segments: [
        { start: 0.0, end: 2.0, text: 'hello', speaker: 'SPEAKER_00' },
      ],
    }

    const config = {
      bedrockModelId: 'test-model',
      additionalContext: 'This is a podcast about parenting in Boston.',
      modelConfig: { max_tokens: 64000, temperature: 0.3 },
    }

    await llmRefinement(transcript, config, mockClient)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const callArg = mockSend.mock.calls[0][0]
    const body = JSON.parse(callArg.input.body)
    const promptText = body.messages[0].content[0].text
    expect(promptText).toContain('This is a podcast about parenting in Boston.')
    expect(promptText).toContain('## Additional Context')
  })

  it('does not include additional context section when not provided', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        ),
      },
    })
    const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient

    const transcript = {
      segments: [
        { start: 0.0, end: 2.0, text: 'hello', speaker: 'SPEAKER_00' },
      ],
    }

    await llmRefinement(transcript, defaultConfig, mockClient)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const callArg = mockSend.mock.calls[0][0]
    const body = JSON.parse(callArg.input.body)
    const promptText = body.messages[0].content[0].text
    expect(promptText).not.toContain('## Additional Context')
    expect(promptText).not.toContain('{{ADDITIONAL_CONTEXT}}')
  })

  it('ignores suggestions where original equals corrected text', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [
        { idx: 0, text: 'hello world' }, // Same as original - should be ignored
        { idx: 1, text: 'Hello World' }, // Different (capitalization) - should apply
      ],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 2.0,
          text: 'hello world',
          speaker: 'SPEAKER_00',
          words: [
            { word: 'hello', start: 0.0, end: 1.0 },
            { word: 'world', start: 1.0, end: 2.0 },
          ],
        },
        {
          start: 2.0,
          end: 4.0,
          text: 'hello world',
          speaker: 'SPEAKER_00',
          words: [
            { word: 'hello', start: 2.0, end: 3.0 },
            { word: 'world', start: 3.0, end: 4.0 },
          ],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    expect(stats.ignoredSuggestions).toHaveLength(1)
    expect(stats.ignoredSuggestions[0]).toEqual({
      originalText: 'hello world',
      correctedText: 'hello world',
      ignoreReason: 'no-change',
    })
    expect(stats.segmentsUpdated).toBe(1)
    expect(stats.updates).toHaveLength(1)
    // First segment unchanged
    expect(transcript.segments[0].text).toBe('hello world')
    // Second segment updated with capitalization
    expect(transcript.segments[1].text).toBe('Hello World')
  })

  it('rejects full sentence rewrites and tracks them in ignoredSuggestions', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [
        {
          idx: 0,
          text: 'So you can have up to 64 concurrent invocations per instance',
        },
      ],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: 'So default in Lambda that would be a one to one ratio',
          speaker: 'SPEAKER_00',
          words: [
            { word: 'So', start: 0.0, end: 0.2 },
            { word: 'default', start: 0.2, end: 0.5 },
            { word: 'in', start: 0.5, end: 0.6 },
            { word: 'Lambda', start: 0.6, end: 0.9 },
            { word: 'that', start: 0.9, end: 1.1 },
            { word: 'would', start: 1.1, end: 1.3 },
            { word: 'be', start: 1.3, end: 1.4 },
            { word: 'a', start: 1.4, end: 1.5 },
            { word: 'one', start: 1.5, end: 1.7 },
            { word: 'to', start: 1.7, end: 1.8 },
            { word: 'one', start: 1.8, end: 2.0 },
            { word: 'ratio', start: 2.0, end: 2.3 },
          ],
        },
      ],
    }

    const stats = await llmRefinement(transcript, defaultConfig, mockClient)

    // Should be rejected as a full rewrite
    expect(stats.segmentsUpdated).toBe(0)
    expect(stats.ignoredSuggestions).toHaveLength(1)
    expect(stats.ignoredSuggestions[0].ignoreReason).toBe('word-change-ratio')
    // Original text should be unchanged
    expect(transcript.segments[0].text).toBe(
      'So default in Lambda that would be a one to one ratio',
    )
  })

  it('allows disabling validation via config', async () => {
    const mockClient = createMockBedrockClient({
      identifiedSpeakers: {},
      updates: [
        {
          idx: 0,
          text: 'Completely different sentence here with new content entirely',
        },
      ],
    })

    const transcript = {
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: 'So default in Lambda that would be a one to one ratio',
          speaker: 'SPEAKER_00',
          words: [
            { word: 'So', start: 0.0, end: 0.2 },
            { word: 'default', start: 0.2, end: 0.5 },
            { word: 'in', start: 0.5, end: 0.6 },
            { word: 'Lambda', start: 0.6, end: 0.9 },
            { word: 'that', start: 0.9, end: 1.1 },
            { word: 'would', start: 1.1, end: 1.3 },
            { word: 'be', start: 1.3, end: 1.4 },
            { word: 'a', start: 1.4, end: 1.5 },
            { word: 'one', start: 1.5, end: 1.7 },
            { word: 'to', start: 1.7, end: 1.8 },
            { word: 'one', start: 1.8, end: 2.0 },
            { word: 'ratio', start: 2.0, end: 2.3 },
          ],
        },
      ],
    }

    const configWithDisabledValidation = {
      ...defaultConfig,
      suggestionValidation: { enabled: false },
    }

    const stats = await llmRefinement(
      transcript,
      configWithDisabledValidation,
      mockClient,
    )

    // Should be applied when validation is disabled
    expect(stats.segmentsUpdated).toBe(1)
    expect(stats.ignoredSuggestions).toHaveLength(0)
    expect(transcript.segments[0].text).toBe(
      'Completely different sentence here with new content entirely',
    )
  })
})
