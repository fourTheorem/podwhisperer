import type { CaptionsConfig } from '@podwhisperer/config'
import { describe, expect, it } from 'vitest'
import type { WhisperxResult } from '../../types'
import { generateVtt } from './vtt'

const defaultConfig: CaptionsConfig = {
  generateVtt: true,
  generateSrt: true,
  generateSimplifiedJson: true,
  highlightWords: false,
  highlightWith: 'underline',
  includeSpeakerNames: 'when-changes',
}

describe('generateVtt', () => {
  describe('basic VTT format', () => {
    it('should start with WEBVTT header', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello' }],
      }

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toMatch(/^WEBVTT\n\n/)
    })

    it('should use VTT timestamp format (period for ms)', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0.5, end: 1.5, text: 'Hello' }],
      }

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toContain('00:00:00.500 --> 00:00:01.500')
    })

    it('should generate cues for each segment', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 2.5, text: 'Hello', speaker: 'Alice' },
          { start: 2.5, end: 5, text: 'World', speaker: 'Bob' },
        ],
      }

      const result = generateVtt({ transcript, config: defaultConfig })
      const lines = result.split('\n')

      // Count timestamp lines
      const timestampLines = lines.filter((l) => l.includes(' --> '))
      expect(timestampLines).toHaveLength(2)
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

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toContain('Alice: Hello')
      expect(result).toContain('Bob: Hi')
      // Third cue should NOT have prefix since speaker didn't change
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

      const result = generateVtt({ transcript, config })

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

      const result = generateVtt({ transcript, config })

      expect(result).not.toContain('Alice:')
      expect(result).not.toContain('Bob:')
      expect(result).toContain('\nHello\n')
      expect(result).toContain('\nWorld\n')
    })
  })

  describe('word highlighting', () => {
    it('should generate one cue per word when highlighting enabled', () => {
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

      const result = generateVtt({ transcript, config })
      const lines = result.split('\n')
      const timestampLines = lines.filter((l) => l.includes(' --> '))

      // Should have 2 cues (one per word)
      expect(timestampLines).toHaveLength(2)
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

      const result = generateVtt({ transcript, config })

      expect(result).toContain('<u>Hello</u> world')
      expect(result).toContain('Hello <u>world</u>')
    })

    it('should use bold tag when configured', () => {
      const config = {
        ...defaultConfig,
        highlightWords: true,
        highlightWith: 'bold' as const,
      }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello',
            speaker: 'Alice',
            words: [{ word: 'Hello', start: 0, end: 1, speaker: 'Alice' }],
          },
        ],
      }

      const result = generateVtt({ transcript, config })

      expect(result).toContain('<b>Hello</b>')
    })

    it('should use italic tag when configured', () => {
      const config = {
        ...defaultConfig,
        highlightWords: true,
        highlightWith: 'italic' as const,
      }
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello',
            speaker: 'Alice',
            words: [{ word: 'Hello', start: 0, end: 1, speaker: 'Alice' }],
          },
        ],
      }

      const result = generateVtt({ transcript, config })

      expect(result).toContain('<i>Hello</i>')
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
              { word: 'world', start: 1.0, end: 1.5, speaker: 'Alice' }, // gap from 0.712 to 1.0
            ],
          },
        ],
      }

      const result = generateVtt({ transcript, config })
      const lines = result.split('\n')

      // Should have: filler (0-0.251), Hello highlighted (0.251-0.712), filler (0.712-1.0), world highlighted (1.0-1.5), filler (1.5-3)
      const timestampLines = lines.filter((l) => l.includes(' --> '))
      expect(timestampLines.length).toBeGreaterThan(2)

      // Filler cues should have no highlighting
      expect(result).toMatch(
        /00:00:00\.712 --> 00:00:01\.000\nAlice: Hello world/,
      )
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

      const result = generateVtt({ transcript, config })

      // Should have entries for Hello, and, happy (with fillers)
      expect(result).toContain('<u>Hello</u>')
      expect(result).toContain('<u>and</u>')
      expect(result).toContain('<u>happy</u>')
      // The word 2026 should appear in the text but NOT be highlighted
      expect(result).not.toContain('<u>2026.</u>')
      // Should not have any timestamp ending at 00:00:00.000 (VTT)
      expect(result).not.toMatch(/--> 00:00:00\.000/)
    })

    it('should handle empty segments array', () => {
      const transcript: WhisperxResult = { segments: [] }

      const result = generateVtt({ transcript, config: defaultConfig })

      // WEBVTT header followed by blank line
      expect(result).toBe('WEBVTT\n')
    })

    it('should escape HTML characters in text', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Tom & Jerry < Friends > enemies' },
        ],
      }

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toContain('Tom &amp; Jerry &lt; Friends &gt; enemies')
    })

    it('should handle segment without words array', () => {
      const config = { ...defaultConfig, highlightWords: true }
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello', speaker: 'Alice' }],
      }

      const result = generateVtt({ transcript, config })

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
              { word: 'Hello', speaker: 'Alice' }, // no timing
              { word: 'world', speaker: 'Alice' }, // no timing
            ],
          },
        ],
      }

      const result = generateVtt({ transcript, config })

      // Should distribute 0-2 seconds across 2 words: 0-1 and 1-2
      expect(result).toContain('00:00:00.000 --> 00:00:01.000')
      expect(result).toContain('00:00:01.000 --> 00:00:02.000')
    })

    it('should use segment speaker when word has no speaker', () => {
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello',
            speaker: 'Alice',
            words: [{ word: 'Hello', start: 0, end: 1 }], // no speaker on word
          },
        ],
      }

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toContain('Alice: Hello')
    })

    it('should fallback to SPEAKER_00 when no speaker info', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello' }],
      }

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toContain('SPEAKER_00: Hello')
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

      const result = generateVtt({ transcript, config: defaultConfig })

      expect(result).toBe(
        `WEBVTT

00:00:00.000 --> 00:00:02.500
Luciano: Hello, welcome to the podcast.

00:00:02.500 --> 00:00:05.000
Eoin: Thanks for having me!
`,
      )
    })
  })
})
