import { describe, expect, it } from 'vitest'
import type { WhisperxSegment } from '../types'
import {
  getSegmentWordsText,
  reconcileSegment,
  reconstructText,
  textToWords,
} from './segment-reconciliation'

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

describe('getSegmentWordsText', () => {
  it('returns text from words array when present', () => {
    const segment: WhisperxSegment = {
      start: 0,
      end: 2,
      text: 'original text field',
      words: [
        { word: 'from', start: 0, end: 1 },
        { word: 'words', start: 1, end: 2 },
      ],
    }
    expect(getSegmentWordsText(segment)).toBe('from words')
  })

  it('falls back to text field when words array is undefined', () => {
    const segment: WhisperxSegment = {
      start: 0,
      end: 2,
      text: 'fallback text',
    }
    expect(getSegmentWordsText(segment)).toBe('fallback text')
  })

  it('falls back to text field when words array is empty', () => {
    const segment: WhisperxSegment = {
      start: 0,
      end: 2,
      text: 'fallback text',
      words: [],
    }
    expect(getSegmentWordsText(segment)).toBe('fallback text')
  })

  it('returns empty string when both are missing', () => {
    const segment: WhisperxSegment = {
      start: 0,
      end: 2,
      text: '',
    }
    expect(getSegmentWordsText(segment)).toBe('')
  })
})

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

  it('handles contraction: 2 words to 1 word with merged timing', () => {
    // When words are removed BEFORE any kept/added word, timing is merged into pendingRemoval
    // This test shows behavior when removed words come AFTER kept words
    const segment = makeSegment([
      { word: 'I' },
      { word: 'love' },
      { word: 'sage' },
      { word: 'maker' },
    ])
    const patched = ['I', 'love', 'SageMaker']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(3)
    expect(segment.words?.[0].word).toBe('I')
    expect(segment.words?.[1].word).toBe('love')
    expect(segment.words?.[2].word).toBe('SageMaker')
    // When removed words extend previous word, new word splits from that extended timing
    // "love" ends up with start=1, end=4 (extended by sage+maker removal)
    // "SageMaker" then splits at midpoint: (1+4)/2 = 2.5
    expect(segment.words?.[2].start).toBe(2.5)
    expect(segment.words?.[2].end).toBe(4.0)
    expect(segment.text).toBe('I love SageMaker')
  })

  it('handles expansion: 1 word to 2 words with split timing', () => {
    const segment = makeSegment([
      { word: 'cannot' },
      { word: 'do' },
      { word: 'this' },
    ])
    const patched = ['can', 'not', 'do', 'this']

    reconcileSegment(segment, patched)

    expect(segment.words?.length).toBe(4)
    expect(segment.words?.[0].word).toBe('can')
    expect(segment.words?.[0].start).toBe(0.0)
    expect(segment.words?.[0].end).toBe(0.5) // midpoint of original "cannot"
    expect(segment.words?.[1].word).toBe('not')
    expect(segment.words?.[1].start).toBe(0.5)
    expect(segment.words?.[1].end).toBe(1.0) // original "cannot" end
    expect(segment.words?.[2].word).toBe('do')
    expect(segment.words?.[3].word).toBe('this')
    expect(segment.text).toBe('can not do this')
  })

  it('handles real timing data scenario', () => {
    const segment: WhisperxSegment = {
      start: 1572.336,
      end: 1578.0,
      text: 'when you set the main execution environment to zero',
      speaker: 'SPEAKER_01',
      words: [
        { word: 'when', start: 1572.336, end: 1572.436, score: 0.9 },
        { word: 'you', start: 1572.476, end: 1572.576, score: 0.9 },
        { word: 'set', start: 1572.616, end: 1572.716, score: 0.9 },
        { word: 'the', start: 1572.756, end: 1572.856, score: 0.9 },
        { word: 'main', start: 1572.896, end: 1572.996, score: 0.9 },
        { word: 'execution', start: 1573.036, end: 1573.236, score: 0.9 },
        { word: 'environment', start: 1573.276, end: 1573.576, score: 0.9 },
        { word: 'to', start: 1573.616, end: 1573.716, score: 0.9 },
        { word: 'zero', start: 1573.756, end: 1573.956, score: 0.9 },
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
})
