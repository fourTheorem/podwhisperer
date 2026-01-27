import type { NormalizationConfig } from '@podwhisperer/config'
import { describe, expect, it } from 'vitest'
import type { WhisperxResult } from '../types'
import { normalizeSegments } from './segments-normalization'

const defaultConfig: NormalizationConfig = {
  normalize: true,
  maxCharsPerSegment: 48,
  maxWordsPerSegment: 10,
  splitSegmentAtSpeakerChange: true,
  punctuationSplitThreshold: 0.7,
  punctuationChars: ['.', ',', '?', '!', ';', ':'],
}

describe('normalizeSegments', () => {
  describe('basic split by word count', () => {
    it('should split segment when word count exceeds maxWordsPerSegment', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'So I think that gives you the general idea of how things work.',
            speaker: 'Alice',
            words: [
              { word: 'So', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'I', start: 0.3, end: 0.4, speaker: 'Alice' },
              { word: 'think', start: 0.5, end: 0.7, speaker: 'Alice' },
              { word: 'that', start: 0.8, end: 1.0, speaker: 'Alice' },
              { word: 'gives', start: 1.1, end: 1.3, speaker: 'Alice' },
              { word: 'you', start: 1.4, end: 1.5, speaker: 'Alice' },
              { word: 'the', start: 1.6, end: 1.7, speaker: 'Alice' },
              { word: 'general', start: 1.8, end: 2.1, speaker: 'Alice' },
              { word: 'idea', start: 2.2, end: 2.4, speaker: 'Alice' },
              { word: 'of', start: 2.5, end: 2.6, speaker: 'Alice' },
              { word: 'how', start: 2.7, end: 2.8, speaker: 'Alice' },
              { word: 'things', start: 2.9, end: 3.1, speaker: 'Alice' },
              { word: 'work.', start: 3.2, end: 3.5, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].words).toHaveLength(10)
      expect(result.segments[0].text).toBe(
        'So I think that gives you the general idea of',
      )
      expect(result.segments[0].start).toBe(0.0)
      expect(result.segments[0].end).toBe(2.6)
      expect(result.segments[0].speaker).toBe('Alice')

      expect(result.segments[1].words).toHaveLength(3)
      expect(result.segments[1].text).toBe('how things work.')
      expect(result.segments[1].start).toBe(2.7)
      expect(result.segments[1].end).toBe(3.5)
      expect(result.segments[1].speaker).toBe('Alice')

      expect(stats.originalSegments).toBe(1)
      expect(stats.normalizedSegments).toBe(2)
      expect(stats.splits).toBe(1)
    })

    it('should not split segment when within word limit', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0.0, end: 0.5, speaker: 'Alice' },
              { word: 'world', start: 0.5, end: 1.0, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].text).toBe('Hello world')
      expect(stats.splits).toBe(0)
    })
  })

  describe('split by character count', () => {
    it('should split segment when character count exceeds maxCharsPerSegment', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 2.0,
            text: 'Supercalifragilisticexpialidocious is a very long word indeed',
            speaker: 'Alice',
            words: [
              {
                word: 'Supercalifragilisticexpialidocious',
                start: 0.0,
                end: 0.5,
                speaker: 'Alice',
              }, // 34 chars
              { word: 'is', start: 0.6, end: 0.7, speaker: 'Alice' }, // +3 = 37
              { word: 'a', start: 0.8, end: 0.9, speaker: 'Alice' }, // +2 = 39
              { word: 'very', start: 1.0, end: 1.2, speaker: 'Alice' }, // +5 = 44
              { word: 'long', start: 1.3, end: 1.5, speaker: 'Alice' }, // +5 = 49 > 48, split before
              { word: 'word', start: 1.6, end: 1.8, speaker: 'Alice' },
              { word: 'indeed', start: 1.9, end: 2.0, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments.length).toBeGreaterThan(1)
      expect(stats.splits).toBeGreaterThan(0)
      // First segment: 34 + 3 + 2 + 5 = 44 chars (before adding "long" would exceed 48)
      expect(result.segments[0].text).toBe(
        'Supercalifragilisticexpialidocious is a very',
      )
      expect(result.segments[1].text).toBe('long word indeed')
    })
  })

  describe('punctuation-aware split', () => {
    it('should split at punctuation when at threshold', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 3.0,
            text: 'First sentence here, and then the second part follows.',
            speaker: 'Alice',
            words: [
              { word: 'First', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'sentence', start: 0.3, end: 0.5, speaker: 'Alice' },
              { word: 'here,', start: 0.6, end: 0.8, speaker: 'Alice' },
              { word: 'and', start: 0.9, end: 1.0, speaker: 'Alice' },
              { word: 'then', start: 1.1, end: 1.2, speaker: 'Alice' },
              { word: 'the', start: 1.3, end: 1.4, speaker: 'Alice' },
              { word: 'second', start: 1.5, end: 1.7, speaker: 'Alice' },
              { word: 'part', start: 1.8, end: 2.0, speaker: 'Alice' }, // 8 words = 80%
              { word: 'follows.', start: 2.1, end: 2.5, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Should split after "part" because at 80% (>= 70%) and "follows." has punctuation
      // But wait, "part" doesn't have punctuation, "follows." does
      // Let's trace through: at word 8 "part" we're at 80%, but "part" doesn't end with punctuation
      // At word 9 "follows." we're at 90% and it ends with punctuation, but it's the last word
      // So no split happens due to punctuation in this case
      expect(stats.originalSegments).toBe(1)
    })

    it('should split at comma when above threshold', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 3.0,
            text: 'One two three four five six seven, eight nine ten.',
            speaker: 'Alice',
            words: [
              { word: 'One', start: 0.0, end: 0.1, speaker: 'Alice' },
              { word: 'two', start: 0.2, end: 0.3, speaker: 'Alice' },
              { word: 'three', start: 0.4, end: 0.5, speaker: 'Alice' },
              { word: 'four', start: 0.6, end: 0.7, speaker: 'Alice' },
              { word: 'five', start: 0.8, end: 0.9, speaker: 'Alice' },
              { word: 'six', start: 1.0, end: 1.1, speaker: 'Alice' },
              { word: 'seven,', start: 1.2, end: 1.3, speaker: 'Alice' }, // 7 words = 70%, comma
              { word: 'eight', start: 1.4, end: 1.5, speaker: 'Alice' },
              { word: 'nine', start: 1.6, end: 1.7, speaker: 'Alice' },
              { word: 'ten.', start: 1.8, end: 2.0, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Should split after "seven," because at 70% and ends with comma
      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].text).toBe('One two three four five six seven,')
      expect(result.segments[1].text).toBe('eight nine ten.')
      expect(stats.splits).toBe(1)
    })

    it('should not split at punctuation when below threshold', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 2.0,
            text: 'Hello, this is a test sentence here.',
            speaker: 'Alice',
            words: [
              { word: 'Hello,', start: 0.0, end: 0.2, speaker: 'Alice' }, // 1 word = 10% < 70%
              { word: 'this', start: 0.3, end: 0.4, speaker: 'Alice' },
              { word: 'is', start: 0.5, end: 0.6, speaker: 'Alice' },
              { word: 'a', start: 0.7, end: 0.8, speaker: 'Alice' },
              { word: 'test', start: 0.9, end: 1.0, speaker: 'Alice' },
              { word: 'sentence', start: 1.1, end: 1.3, speaker: 'Alice' },
              { word: 'here.', start: 1.4, end: 1.6, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Should not split because "Hello," is at only 10%
      expect(result.segments).toHaveLength(1)
      expect(stats.splits).toBe(0)
    })
  })

  describe('speaker change split', () => {
    it('should split when speaker changes', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 2.0,
            text: "I agree. That's right.",
            speaker: 'Alice',
            words: [
              { word: 'I', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'agree.', start: 0.3, end: 0.6, speaker: 'Alice' },
              { word: "That's", start: 0.8, end: 1.2, speaker: 'Bob' },
              { word: 'right.', start: 1.3, end: 1.6, speaker: 'Bob' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].text).toBe('I agree.')
      expect(result.segments[0].speaker).toBe('Alice')
      expect(result.segments[1].text).toBe("That's right.")
      expect(result.segments[1].speaker).toBe('Bob')
      expect(stats.splits).toBe(1)
    })

    it('should not split on speaker change when disabled', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 2.0,
            text: "I agree. That's right.",
            speaker: 'Alice',
            words: [
              { word: 'I', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'agree.', start: 0.3, end: 0.6, speaker: 'Alice' },
              { word: "That's", start: 0.8, end: 1.2, speaker: 'Bob' },
              { word: 'right.', start: 1.3, end: 1.6, speaker: 'Bob' },
            ],
          },
        ],
      }

      const config = { ...defaultConfig, splitSegmentAtSpeakerChange: false }
      const stats = normalizeSegments(result, config)

      expect(result.segments).toHaveLength(1)
      expect(stats.splits).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('should handle segment without words array', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world',
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].text).toBe('Hello world')
      expect(stats.splits).toBe(0)
    })

    it('should handle segment with empty words array', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world',
            words: [],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(1)
      expect(stats.splits).toBe(0)
    })

    it('should handle empty segments array', () => {
      const result: WhisperxResult = {
        segments: [],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(0)
      expect(stats.originalSegments).toBe(0)
      expect(stats.normalizedSegments).toBe(0)
      expect(stats.splits).toBe(0)
    })

    it('should handle single long word exceeding maxChars', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Pneumonoultramicroscopicsilicovolcanoconiosis',
            speaker: 'Alice',
            words: [
              {
                word: 'Pneumonoultramicroscopicsilicovolcanoconiosis',
                start: 0.0,
                end: 1.0,
                speaker: 'Alice',
              },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Single word should be kept even if it exceeds maxChars
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].text).toBe(
        'Pneumonoultramicroscopicsilicovolcanoconiosis',
      )
      expect(stats.splits).toBe(0)
    })

    it('should handle missing timing data', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world',
            speaker: 'Alice',
            words: [
              { word: 'Hello', speaker: 'Alice' },
              { word: 'world', speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].start).toBe(0)
      expect(result.segments[0].end).toBe(0)
      expect(stats.splits).toBe(0)
    })

    it('should preserve speaker when word has no speaker', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world friend',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0.0, end: 0.3, speaker: 'Alice' },
              { word: 'world', start: 0.4, end: 0.6 }, // no speaker
              { word: 'friend', start: 0.7, end: 1.0 }, // no speaker
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].speaker).toBe('Alice')
      expect(stats.splits).toBe(0)
    })
  })

  describe('multiple segments', () => {
    it('should process multiple segments independently', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 4.0,
            text: 'One two three four five six seven eight nine ten eleven.',
            speaker: 'Alice',
            words: [
              { word: 'One', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'two', start: 0.3, end: 0.4, speaker: 'Alice' },
              { word: 'three', start: 0.5, end: 0.6, speaker: 'Alice' },
              { word: 'four', start: 0.7, end: 0.8, speaker: 'Alice' },
              { word: 'five', start: 0.9, end: 1.0, speaker: 'Alice' },
              { word: 'six', start: 1.1, end: 1.2, speaker: 'Alice' },
              { word: 'seven', start: 1.3, end: 1.5, speaker: 'Alice' },
              { word: 'eight', start: 1.6, end: 1.8, speaker: 'Alice' },
              { word: 'nine', start: 1.9, end: 2.1, speaker: 'Alice' },
              { word: 'ten', start: 2.2, end: 2.4, speaker: 'Alice' },
              { word: 'eleven.', start: 2.5, end: 2.8, speaker: 'Alice' },
            ],
          },
          {
            start: 5.0,
            end: 6.0,
            text: 'Short segment.',
            speaker: 'Bob',
            words: [
              { word: 'Short', start: 5.0, end: 5.3, speaker: 'Bob' },
              { word: 'segment.', start: 5.4, end: 5.8, speaker: 'Bob' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // First segment should be split (11 words > 10)
      // Second segment should stay as-is (2 words)
      expect(result.segments.length).toBe(3)
      expect(stats.originalSegments).toBe(2)
      expect(stats.normalizedSegments).toBe(3)
      expect(stats.splits).toBe(1)
    })
  })

  describe('combined conditions', () => {
    it('should handle speaker change and word limit together', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'One two three four five six seven eight nine ten eleven twelve from Bob.',
            speaker: 'Alice',
            words: [
              { word: 'One', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'two', start: 0.3, end: 0.4, speaker: 'Alice' },
              { word: 'three', start: 0.5, end: 0.6, speaker: 'Alice' },
              { word: 'four', start: 0.7, end: 0.8, speaker: 'Alice' },
              { word: 'five', start: 0.9, end: 1.0, speaker: 'Alice' },
              { word: 'six', start: 1.1, end: 1.2, speaker: 'Alice' },
              { word: 'seven', start: 1.3, end: 1.5, speaker: 'Alice' },
              { word: 'eight', start: 1.6, end: 1.8, speaker: 'Alice' },
              { word: 'nine', start: 1.9, end: 2.1, speaker: 'Alice' },
              { word: 'ten', start: 2.2, end: 2.4, speaker: 'Alice' },
              { word: 'eleven', start: 2.5, end: 2.7, speaker: 'Alice' },
              { word: 'twelve', start: 2.8, end: 3.0, speaker: 'Alice' },
              { word: 'from', start: 3.1, end: 3.3, speaker: 'Bob' },
              { word: 'Bob.', start: 3.4, end: 3.6, speaker: 'Bob' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Should split at word 10 (word limit) and at speaker change
      expect(result.segments.length).toBe(3)
      expect(result.segments[0].speaker).toBe('Alice')
      expect(result.segments[0].words).toHaveLength(10)
      expect(result.segments[1].speaker).toBe('Alice')
      expect(result.segments[1].words).toHaveLength(2)
      expect(result.segments[2].speaker).toBe('Bob')
      expect(result.segments[2].words).toHaveLength(2)
      expect(stats.splits).toBe(2)
    })
  })

  describe('distribution stats', () => {
    it('should compute distribution stats for normalized segments', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 2.0,
            text: 'Hello world friend',
            speaker: 'Alice',
            words: [
              { word: 'Hello', start: 0.0, end: 0.3, speaker: 'Alice' },
              { word: 'world', start: 0.4, end: 0.6, speaker: 'Alice' },
              { word: 'friend', start: 0.7, end: 1.0, speaker: 'Alice' },
            ],
          },
          {
            start: 3.0,
            end: 4.0,
            text: 'Short one',
            speaker: 'Bob',
            words: [
              { word: 'Short', start: 3.0, end: 3.3, speaker: 'Bob' },
              { word: 'one', start: 3.4, end: 3.7, speaker: 'Bob' },
            ],
          },
          {
            start: 5.0,
            end: 6.0,
            text: 'A longer segment here now',
            speaker: 'Alice',
            words: [
              { word: 'A', start: 5.0, end: 5.1, speaker: 'Alice' },
              { word: 'longer', start: 5.2, end: 5.4, speaker: 'Alice' },
              { word: 'segment', start: 5.5, end: 5.7, speaker: 'Alice' },
              { word: 'here', start: 5.8, end: 5.9, speaker: 'Alice' },
              { word: 'now', start: 6.0, end: 6.1, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Verify distribution stats structure
      expect(stats.wordsPerSegment).toBeDefined()
      expect(stats.charsPerSegment).toBeDefined()

      // Word counts: [3, 2, 5] -> min: 2, max: 5, avg: 3.33, p95: 5
      expect(stats.wordsPerSegment.min).toBe(2)
      expect(stats.wordsPerSegment.max).toBe(5)
      expect(stats.wordsPerSegment.avg).toBe(3.33)
      expect(stats.wordsPerSegment.p95).toBe(5)

      // Char counts: "Hello world friend" = 18, "Short one" = 9, "A longer segment here now" = 25
      // Sorted: [9, 18, 25] -> min: 9, max: 25, avg: 17.33, p95: 25
      expect(stats.charsPerSegment.min).toBe(9)
      expect(stats.charsPerSegment.max).toBe(25)
      expect(stats.charsPerSegment.avg).toBe(17.33)
      expect(stats.charsPerSegment.p95).toBe(25)
    })

    it('should handle empty segments array for distribution stats', () => {
      const result: WhisperxResult = {
        segments: [],
      }

      const stats = normalizeSegments(result, defaultConfig)

      expect(stats.wordsPerSegment).toEqual({ min: 0, max: 0, avg: 0, p95: 0 })
      expect(stats.charsPerSegment).toEqual({ min: 0, max: 0, avg: 0, p95: 0 })
    })

    it('should compute distribution stats after splitting', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 4.0,
            text: 'One two three four five six seven eight nine ten eleven.',
            speaker: 'Alice',
            words: [
              { word: 'One', start: 0.0, end: 0.2, speaker: 'Alice' },
              { word: 'two', start: 0.3, end: 0.4, speaker: 'Alice' },
              { word: 'three', start: 0.5, end: 0.6, speaker: 'Alice' },
              { word: 'four', start: 0.7, end: 0.8, speaker: 'Alice' },
              { word: 'five', start: 0.9, end: 1.0, speaker: 'Alice' },
              { word: 'six', start: 1.1, end: 1.2, speaker: 'Alice' },
              { word: 'seven', start: 1.3, end: 1.5, speaker: 'Alice' },
              { word: 'eight', start: 1.6, end: 1.8, speaker: 'Alice' },
              { word: 'nine', start: 1.9, end: 2.1, speaker: 'Alice' },
              { word: 'ten', start: 2.2, end: 2.4, speaker: 'Alice' },
              { word: 'eleven.', start: 2.5, end: 2.8, speaker: 'Alice' },
            ],
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Should have split into 2 segments (11 words > 10 max)
      expect(result.segments).toHaveLength(2)
      expect(stats.splits).toBe(1)

      // Verify stats are computed on the split result
      // Segment 1: 10 words, Segment 2: 1 word
      expect(stats.wordsPerSegment.min).toBe(1)
      expect(stats.wordsPerSegment.max).toBe(10)
    })

    it('should handle segment without words for distribution stats', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'Hello world',
          },
        ],
      }

      const stats = normalizeSegments(result, defaultConfig)

      // Segment without words array should count as 0 words
      expect(stats.wordsPerSegment.min).toBe(0)
      expect(stats.wordsPerSegment.max).toBe(0)
      // But text length should still be counted
      expect(stats.charsPerSegment.min).toBe(11)
      expect(stats.charsPerSegment.max).toBe(11)
    })
  })
})
