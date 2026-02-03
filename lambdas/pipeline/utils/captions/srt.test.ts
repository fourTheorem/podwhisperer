import type { CaptionsConfig } from '@podwhisperer/config'
import { describe, expect, it } from 'vitest'
import type { WhisperxResult } from '../../types'
import { generateSrt } from './srt'

const defaultConfig: CaptionsConfig = {
  generateVtt: true,
  generateSrt: true,
  generateSimplifiedJson: true,
  highlightWords: false,
  highlightWith: 'underline',
  includeSpeakerNames: 'when-changes',
}

describe('generateSrt', () => {
  describe('basic SRT format', () => {
    it('should start with cue number 1', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello' }],
      }

      const result = generateSrt({ transcript, config: defaultConfig })
      const lines = result.split('\n')

      expect(lines[0]).toBe('1')
    })

    it('should use SRT timestamp format (comma for ms)', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0.5, end: 1.5, text: 'Hello' }],
      }

      const result = generateSrt({ transcript, config: defaultConfig })

      expect(result).toContain('00:00:00,500 --> 00:00:01,500')
    })

    it('should number cues sequentially', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'First', speaker: 'Alice' },
          { start: 1, end: 2, text: 'Second', speaker: 'Bob' },
          { start: 2, end: 3, text: 'Third', speaker: 'Charlie' },
        ],
      }

      const result = generateSrt({ transcript, config: defaultConfig })
      const lines = result.split('\n')

      // Find lines that are just numbers
      const numbers = lines.filter((l) => /^\d+$/.test(l))
      expect(numbers).toEqual(['1', '2', '3'])
    })
  })

  describe('speaker names', () => {
    it('should include speaker name when speaker changes (default)', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Hello', speaker: 'Alice' },
          { start: 1, end: 2, text: 'Hi', speaker: 'Bob' },
          { start: 2, end: 3, text: 'How are you?', speaker: 'Bob' },
        ],
      }

      const result = generateSrt({ transcript, config: defaultConfig })

      expect(result).toContain('Alice: Hello')
      expect(result).toContain('Bob: Hi')
      expect(result).toContain('\nHow are you?\n')
    })

    it('should always include speaker name when configured', () => {
      const config = {
        ...defaultConfig,
        includeSpeakerNames: 'always' as const,
      }
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Hello', speaker: 'Alice' },
          { start: 1, end: 2, text: 'World', speaker: 'Alice' },
        ],
      }

      const result = generateSrt({ transcript, config })

      expect(result).toContain('Alice: Hello')
      expect(result).toContain('Alice: World')
    })

    it('should never include speaker name when configured', () => {
      const config = { ...defaultConfig, includeSpeakerNames: 'never' as const }
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Hello', speaker: 'Alice' },
          { start: 1, end: 2, text: 'World', speaker: 'Bob' },
        ],
      }

      const result = generateSrt({ transcript, config })

      expect(result).not.toContain('Alice:')
      expect(result).not.toContain('Bob:')
    })
  })

  describe('word highlighting', () => {
    it('should generate numbered cues for each word when highlighting enabled', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0, end: 1, speaker: 'Alice' },
              { word: 'world', start: 1, end: 2, speaker: 'Alice' },
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })
      const lines = result.split('\n')
      const numbers = lines.filter((l) => /^\d+$/.test(l))

      expect(numbers).toHaveLength(2)
      expect(numbers).toEqual(['1', '2'])
    })

    it('should highlight words with underline tag by default', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0, end: 1, speaker: 'Alice' },
              { word: 'world', start: 1, end: 2, speaker: 'Alice' },
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })

      expect(result).toContain('<u>Hello</u> world')
      expect(result).toContain('Hello <u>world</u>')
    })

    it('should insert filler cues for timing gaps', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 3,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0.251, end: 0.712, speaker: 'Alice' },
              { word: 'world', start: 1.0, end: 1.5, speaker: 'Alice' },
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })

      // Should have filler cue between 0.712 and 1.0
      expect(result).toContain('00:00:00,712 --> 00:00:01,000')
    })

    it('should number all cues including fillers sequentially', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0.251,
            end: 2,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0.251, end: 0.712, speaker: 'Alice' },
              { word: 'world', start: 1.0, end: 1.5, speaker: 'Alice' },
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })
      const lines = result.split('\n')
      const numbers = lines
        .filter((l) => /^\d+$/.test(l))
        .map((n) => Number.parseInt(n, 10))

      // Should be sequential with no gaps
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBe(numbers[i - 1] + 1)
      }
    })
  })

  describe('edge cases', () => {
    it('should skip highlighted cue for word without timing info', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0.251,
            end: 0, // Invalid segment end
            text: 'Hello and happy 2026.',
            speaker: 'Luciano',
            words: [
              { word: 'Hello', start: 0.251, end: 0.712, speaker: 'Luciano' },
              { word: 'and', start: 0.852, end: 0.972, speaker: 'Luciano' },
              { word: 'happy', start: 1.092, end: 1.772, speaker: 'Luciano' },
              { word: '2026.' }, // No timing info at all
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })

      // Should have entries for Hello, and, happy (with fillers)
      expect(result).toContain('<u>Hello</u>')
      expect(result).toContain('<u>and</u>')
      expect(result).toContain('<u>happy</u>')
      // The word 2026 should appear in the text but NOT be highlighted
      expect(result).not.toContain('<u>2026.</u>')
      // Should not have any timestamp ending at 00:00:00,000 (SRT)
      expect(result).not.toMatch(/--> 00:00:00,000/)
    })

    it('should handle empty segments array', () => {
      const transcript: WhisperxResult = { segments: [] }

      const result = generateSrt({ transcript, config: defaultConfig })

      expect(result).toBe('')
    })

    it('should escape HTML characters in text', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Tom & Jerry < Friends > enemies' },
        ],
      }

      const result = generateSrt({ transcript, config: defaultConfig })

      expect(result).toContain('Tom &amp; Jerry &lt; Friends &gt; enemies')
    })

    it('should handle segment without words array', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello', speaker: 'Alice' }],
      }

      const result = generateSrt({ transcript, config })

      // Should fall back to basic mode
      expect(result).toContain('Alice: Hello')
    })

    it('should distribute timing when word timing is missing', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', speaker: 'Alice' },
              { word: 'world', speaker: 'Alice' },
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })

      expect(result).toContain('00:00:00,000 --> 00:00:01,000')
      expect(result).toContain('00:00:01,000 --> 00:00:02,000')
    })
  })

  describe('multiple segments', () => {
    it('should generate correct output for conversation', () => {
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2.5,
            text: 'Hello, welcome to the podcast.',
            speaker: 'Luciano',
          },
          {
            start: 2.5,
            end: 5.0,
            text: 'Thanks for having me!',
            speaker: 'Eoin',
          },
        ],
      }

      const result = generateSrt({ transcript, config: defaultConfig })

      expect(result).toBe(
        `1
00:00:00,000 --> 00:00:02,500
Luciano: Hello, welcome to the podcast.

2
00:00:02,500 --> 00:00:05,000
Eoin: Thanks for having me!
`,
      )
    })
  })

  describe('word highlighting example from plan', () => {
    it('should match the expected output format from the plan', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0.251,
            end: 1.772,
            text: 'Hello, and happy 2026.',
            speaker: 'SPEAKER_01',
            words: [
              {
                word: 'Hello,',
                start: 0.251,
                end: 0.712,
                speaker: 'SPEAKER_01',
              },
              { word: 'and', start: 0.852, end: 0.972, speaker: 'SPEAKER_01' },
              {
                word: 'happy',
                start: 1.092,
                end: 1.772,
                speaker: 'SPEAKER_01',
              },
              {
                word: '2026.',
                start: 1.772,
                end: 1.772,
                speaker: 'SPEAKER_01',
              }, // zero-duration word at end
            ],
          },
        ],
      }

      const result = generateSrt({ transcript, config })

      // First highlighted cue
      expect(result).toContain('00:00:00,251 --> 00:00:00,712')
      expect(result).toContain('SPEAKER_01: <u>Hello,</u> and happy 2026.')

      // Filler between Hello and and
      expect(result).toContain('00:00:00,712 --> 00:00:00,852')
      expect(result).toContain('SPEAKER_01: Hello, and happy 2026.')

      // and highlighted
      expect(result).toContain('00:00:00,852 --> 00:00:00,972')
      expect(result).toContain('SPEAKER_01: Hello, <u>and</u> happy 2026.')

      // Filler between and and happy
      expect(result).toContain('00:00:00,972 --> 00:00:01,092')

      // happy highlighted
      expect(result).toContain('00:00:01,092 --> 00:00:01,772')
      expect(result).toContain('SPEAKER_01: Hello, and <u>happy</u> 2026.')
    })
  })
})
