import { describe, expect, it } from 'vitest'
import type { WhisperxResult, WhisperxWord } from '../types'
import { fillTimingGaps } from './fill-timing-gaps'

/** Helper to create a word with timing */
function w(
  word: string,
  start?: number,
  end?: number,
  score?: number | null,
): WhisperxWord {
  const result: WhisperxWord = { word }
  if (start !== undefined) result.start = start
  if (end !== undefined) result.end = end
  if (score !== undefined) result.score = score
  return result
}

/** Helper to create a simple transcript */
function transcript(
  segments: {
    start: number
    end: number
    text: string
    words?: WhisperxWord[]
  }[],
): WhisperxResult {
  return { segments }
}

/** Helper to get words from a segment (avoids non-null assertions) */
function getWords(t: WhisperxResult, segIdx = 0): WhisperxWord[] {
  const words = t.segments[segIdx].words
  expect(words).toBeDefined()
  return words as WhisperxWord[]
}

const enabledConfig = { enabled: true }

describe('fillTimingGaps', () => {
  it('fills a single missing word between two timed words', () => {
    const t = transcript([
      {
        start: 0,
        end: 3,
        text: 'hello world goodbye',
        words: [w('hello', 0, 1, 0.9), w('world'), w('goodbye', 2, 3, 0.8)],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    expect(filled.start).toBeDefined()
    expect(filled.end).toBeDefined()
    expect(filled.score).toBeNull()
    expect(filled.start).toBeGreaterThanOrEqual(1)
    expect(filled.end).toBeLessThanOrEqual(2)
    expect(stats.wordsFilled).toBe(1)
    expect(stats.gapsFound).toBe(1)
    expect(stats.gapTypes.middle).toBe(1)
  })

  it('fills multiple separate gaps in one segment', () => {
    const t = transcript([
      {
        start: 0,
        end: 10,
        text: 'aaa bbb ccc ddd eee',
        words: [
          w('aaa', 0, 1, 0.9),
          w('bbb'),
          w('ccc', 4, 5, 0.8),
          w('ddd'),
          w('eee', 8, 10, 0.7),
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.gapsFound).toBe(2)
    expect(stats.wordsFilled).toBe(2)
    const words = getWords(t)
    expect(words[1].start).toBeDefined()
    expect(words[1].end).toBeDefined()
    expect(words[3].start).toBeDefined()
    expect(words[3].end).toBeDefined()
  })

  it('returns zero stats when no gaps exist', () => {
    const t = transcript([
      {
        start: 0,
        end: 3,
        text: 'hello world',
        words: [w('hello', 0, 1, 0.9), w('world', 1, 3, 0.8)],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.wordsFilled).toBe(0)
    expect(stats.gapsFound).toBe(0)
    // Words should be unchanged
    const words = getWords(t)
    expect(words[0].score).toBe(0.9)
    expect(words[1].score).toBe(0.8)
  })

  it('fills missing word at end of segment using segment.end as right anchor', () => {
    const t = transcript([
      {
        start: 0,
        end: 5,
        text: 'hello world',
        words: [w('hello', 0, 2, 0.9), w('world')],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    expect(filled.start).toBeDefined()
    expect(filled.end).toBeDefined()
    expect(filled.end).toBeLessThanOrEqual(5)
    expect(filled.score).toBeNull()
    expect(stats.gapTypes.end).toBe(1)
  })

  it('fills missing word at start of segment using segment.start as left anchor', () => {
    const t = transcript([
      {
        start: 0,
        end: 5,
        text: 'hello world',
        words: [w('hello'), w('world', 3, 5, 0.8)],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[0]
    expect(filled.start).toBeDefined()
    expect(filled.end).toBeDefined()
    expect(filled.start).toBeGreaterThanOrEqual(0)
    expect(filled.score).toBeNull()
    expect(stats.gapTypes.start).toBe(1)
  })

  it('distributes 3 consecutive missing words proportionally by character length', () => {
    const t = transcript([
      {
        start: 0,
        end: 10,
        text: 'start ab abcd abcdef end',
        words: [
          w('start', 0, 1, 0.9),
          w('ab'), // 2 chars
          w('abcd'), // 4 chars
          w('abcdef'), // 6 chars
          w('end', 9, 10, 0.8),
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.wordsFilled).toBe(3)
    expect(stats.gapsFound).toBe(1)

    const words = getWords(t)
    // All 3 should have timing now
    expect(words[1].start).toBeDefined()
    expect(words[2].start).toBeDefined()
    expect(words[3].start).toBeDefined()

    // Proportional: word with 6 chars should get ~3x the duration of word with 2 chars
    const d1 = (words[1].end as number) - (words[1].start as number)
    const d3 = (words[3].end as number) - (words[3].start as number)
    expect(d3 / d1).toBeCloseTo(3, 0)

    // Continuity: each word starts where previous ends
    expect(words[2].start).toBeCloseTo(words[1].end as number, 3)
    expect(words[3].start).toBeCloseTo(words[2].end as number, 3)
  })

  it('fills all words when entire segment has missing timing', () => {
    const t = transcript([
      {
        start: 2,
        end: 5,
        text: 'hello world',
        words: [w('hello'), w('world')],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.gapTypes.entireSegment).toBe(1)
    expect(stats.wordsFilled).toBe(2)

    const words = getWords(t)
    expect(words[0].start).toBeGreaterThanOrEqual(2)
    expect(words[1].end).toBeLessThanOrEqual(5)
    expect(words[0].score).toBeNull()
    expect(words[1].score).toBeNull()
  })

  it('allocates time proportional to word length', () => {
    // "hi" (2 chars) vs "conversation" (12 chars) — 1:6 ratio
    const t = transcript([
      {
        start: 0,
        end: 14,
        text: 'hi conversation',
        words: [w('hi'), w('conversation')],
      },
    ])

    fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const d0 = (words[0].end as number) - (words[0].start as number)
    const d1 = (words[1].end as number) - (words[1].start as number)
    // conversation (12 chars) should be 6x the duration of hi (2 chars)
    expect(d1 / d0).toBeCloseTo(6, 0)
  })

  it('applies padding when space allows', () => {
    // With enough space, the first filled word should not start exactly at the left anchor
    const t = transcript([
      {
        start: 0,
        end: 100,
        text: 'a xxxx here ',
        words: [w('a', 0, 5, 0.9), w('xxxx'), w('here', 95, 100, 0.8)],
      },
    ])

    fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    // Should be padded away from the left anchor (5)
    expect(filled.start).toBeGreaterThan(5)
    // And padded away from the right anchor (95)
    expect(filled.end).toBeLessThan(95)
  })

  it('skips padding when interval is tight', () => {
    // Very short interval between anchors — padding should be skipped
    const t = transcript([
      {
        start: 0,
        end: 1,
        text: 'a b c',
        words: [w('a', 0, 0.4, 0.9), w('b'), w('c', 0.6, 1, 0.8)],
      },
    ])

    fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    // Interval is 0.6-0.4=0.2, charRate=1/5=0.2, padding would be 0.2 which is >= half of 0.2
    // So padding should be skipped and word should use the full interval
    expect(filled.start).toBeDefined()
    expect(filled.end).toBeDefined()
    expect(filled.score).toBeNull()
  })

  it('handles zero-duration gap where anchors are the same', () => {
    const t = transcript([
      {
        start: 0,
        end: 3,
        text: 'hello world bye',
        words: [w('hello', 0, 1.5, 0.9), w('world'), w('bye', 1.5, 3, 0.8)],
      },
    ])

    fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    // Left anchor = 1.5, right anchor = 1.5 — zero interval
    expect(filled.start).toBe(1.5)
    expect(filled.end).toBe(1.5)
    expect(filled.score).toBeNull()
  })

  it('sets score to null for filled words and leaves existing scores untouched', () => {
    const t = transcript([
      {
        start: 0,
        end: 5,
        text: 'aaa bbb ccc',
        words: [w('aaa', 0, 1, 0.95), w('bbb'), w('ccc', 4, 5, 0.87)],
      },
    ])

    fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    expect(words[0].score).toBe(0.95)
    expect(words[1].score).toBeNull()
    expect(words[2].score).toBe(0.87)
  })

  it('skips segments without words array gracefully', () => {
    const t = transcript([
      {
        start: 0,
        end: 3,
        text: 'hello world',
        // no words array
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.totalSegments).toBe(1)
    expect(stats.totalWords).toBe(0)
    expect(stats.wordsFilled).toBe(0)
  })

  it('returns zero stats for empty transcript', () => {
    const t = transcript([])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats).toEqual({
      totalSegments: 0,
      totalWords: 0,
      wordsFilled: 0,
      gapsFound: 0,
      gapTypes: { middle: 0, start: 0, end: 0, entireSegment: 0 },
    })
  })

  it('handles real-world pattern: numbers and currency words', () => {
    // Simulates WhisperX output where numbers/currency lack timing
    const t = transcript([
      {
        start: 10,
        end: 16,
        text: 'it costs $8 or $0.25 per unit',
        words: [
          w('it', 10, 10.5, 0.9),
          w('costs', 10.5, 11, 0.85),
          w('$8'), // missing timing (currency)
          w('or', 12, 12.5, 0.8),
          w('$0.25'), // missing timing (currency)
          w('per', 14, 14.5, 0.9),
          w('unit', 14.5, 16, 0.85),
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    expect(stats.wordsFilled).toBe(2)
    expect(stats.gapsFound).toBe(2)

    const words = getWords(t)
    // $8 should be between 'costs' end (11) and 'or' start (12)
    expect(words[2].start).toBeGreaterThanOrEqual(11)
    expect(words[2].end).toBeLessThanOrEqual(12)
    expect(words[2].score).toBeNull()

    // $0.25 should be between 'or' end (12.5) and 'per' start (14)
    expect(words[4].start).toBeGreaterThanOrEqual(12.5)
    expect(words[4].end).toBeLessThanOrEqual(14)
    expect(words[4].score).toBeNull()
  })

  it('returns early when config is disabled', () => {
    const t = transcript([
      {
        start: 0,
        end: 3,
        text: 'hello world',
        words: [w('hello'), w('world')],
      },
    ])

    const stats = fillTimingGaps(t, { enabled: false })

    expect(stats.totalSegments).toBe(0)
    expect(stats.wordsFilled).toBe(0)
    // Words should be unchanged
    const words = getWords(t)
    expect(words[0].start).toBeUndefined()
  })

  it('handles partial gap: word with start but missing end', () => {
    const t = transcript([
      {
        start: 0,
        end: 5,
        text: 'hello world',
        words: [
          w('hello', 0, 1, 0.9),
          { word: 'world', start: 2, score: 0.7 } as WhisperxWord,
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    expect(filled.end).toBeDefined()
    expect(filled.end).toBeLessThanOrEqual(5)
    expect(filled.score).toBeNull()
    expect(stats.wordsFilled).toBe(1)
  })

  it('handles partial gap: word with end but missing start', () => {
    const t = transcript([
      {
        start: 0,
        end: 5,
        text: 'hello world',
        words: [
          w('hello', 0, 1, 0.9),
          { word: 'world', end: 4, score: 0.7 } as WhisperxWord,
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    const filled = words[1]
    expect(filled.start).toBeDefined()
    expect(filled.start).toBeGreaterThanOrEqual(0)
    expect(filled.score).toBeNull()
    expect(stats.wordsFilled).toBe(1)
  })

  it('clamps partial gap (missing end) to next word start to avoid overlap', () => {
    // charRate for "ab cd ef" over 0-10 = 10/8 = 1.25 per char
    // estimated end for "cd" = 3 + 1.25*2 = 5.5, but next word starts at 4
    // should clamp to 4
    const t = transcript([
      {
        start: 0,
        end: 10,
        text: 'ab cd ef',
        words: [
          w('ab', 0, 2, 0.9),
          { word: 'cd', start: 3 } as WhisperxWord,
          w('ef', 4, 10, 0.8),
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    expect(stats.wordsFilled).toBe(1)
    expect(words[1].end).toBeDefined()
    // Must not exceed the next word's start (4)
    expect(words[1].end as number).toBeLessThanOrEqual(4)
  })

  it('clamps partial gap (missing start) to previous word end to avoid overlap', () => {
    // charRate for "ab cd ef" over 0-10 = 10/8 = 1.25 per char
    // estimated start for "cd" = 7 - 1.25*2 = 4.5, but previous word ends at 6
    // should clamp to 6
    const t = transcript([
      {
        start: 0,
        end: 10,
        text: 'ab cd ef',
        words: [
          w('ab', 0, 6, 0.9),
          { word: 'cd', end: 7 } as WhisperxWord,
          w('ef', 8, 10, 0.8),
        ],
      },
    ])

    const stats = fillTimingGaps(t, enabledConfig)

    const words = getWords(t)
    expect(stats.wordsFilled).toBe(1)
    expect(words[1].start).toBeDefined()
    // Must not precede the previous word's end (6)
    expect(words[1].start as number).toBeGreaterThanOrEqual(6)
  })
})
