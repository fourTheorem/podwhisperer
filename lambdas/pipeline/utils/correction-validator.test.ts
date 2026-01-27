import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VALIDATION_CONFIG,
  levenshteinDistance,
  maxConsecutiveWordChanges,
  normalizedEditDistance,
  validateCorrection,
  wordChangeRatio,
} from './correction-validator'

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
  })

  it('returns length of non-empty string when other is empty', () => {
    expect(levenshteinDistance('hello', '')).toBe(5)
    expect(levenshteinDistance('', 'world')).toBe(5)
  })

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0)
  })

  it('counts single character substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1)
  })

  it('counts single character insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1)
  })

  it('counts single character deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1)
  })

  it('handles multiple operations', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('normalizedEditDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(normalizedEditDistance('hello', 'hello')).toBe(0)
  })

  it('returns 0 for two empty strings', () => {
    expect(normalizedEditDistance('', '')).toBe(0)
  })

  it('returns 1 when one string is empty', () => {
    expect(normalizedEditDistance('hello', '')).toBe(1)
    expect(normalizedEditDistance('', 'world')).toBe(1)
  })

  it('returns value between 0 and 1 for partial changes', () => {
    const dist = normalizedEditDistance('hello world', 'hello universe')
    expect(dist).toBeGreaterThan(0)
    expect(dist).toBeLessThan(1)
  })

  it('handles case-sensitive comparison', () => {
    const dist = normalizedEditDistance('Hello', 'hello')
    expect(dist).toBeGreaterThan(0)
  })
})

describe('wordChangeRatio', () => {
  it('returns 0 for identical text', () => {
    expect(wordChangeRatio('hello world', 'hello world')).toBe(0)
  })

  it('returns 0 for two empty strings', () => {
    expect(wordChangeRatio('', '')).toBe(0)
  })

  it('returns 1 when original is empty', () => {
    expect(wordChangeRatio('', 'hello world')).toBe(1)
  })

  it('returns ratio based on changed words', () => {
    // 1 out of 2 words changed = 0.5
    expect(wordChangeRatio('hello world', 'hello universe')).toBe(0.5)
  })

  it('handles all words changed', () => {
    expect(wordChangeRatio('hello world', 'goodbye universe')).toBe(1)
  })

  it('handles word additions', () => {
    // LCS-based: finds ["hello", "world"] as common, only "big" is added
    // 1 out of 3 total words changed
    expect(wordChangeRatio('hello world', 'hello big world')).toBeCloseTo(
      1 / 3,
      5,
    )
  })

  it('handles word merges without cascading misalignment', () => {
    // "lambda land" (2 words) merged to "LambdaLith" (1 word)
    // LCS correctly identifies most words are unchanged
    // Original: 21 words, Corrected: 20 words, LCS: 19 common words
    // Changed: max(21, 20) - 19 = 2, Ratio: 2/21 ≈ 0.095
    const original =
      'I think this approach pushes you a little bit more into the lambda land, as we did in our particular example.'
    const corrected =
      'I think this approach pushes you a little bit more into the LambdaLith, as we did in our particular example.'
    const ratio = wordChangeRatio(original, corrected)
    expect(ratio).toBeLessThan(0.15) // Well under 40% threshold
  })

  it('is case-insensitive', () => {
    expect(wordChangeRatio('Hello World', 'hello world')).toBe(0)
  })

  it('handles multiple spaces', () => {
    expect(wordChangeRatio('hello   world', 'hello world')).toBe(0)
  })
})

describe('maxConsecutiveWordChanges', () => {
  it('returns 0 for identical text', () => {
    expect(maxConsecutiveWordChanges('hello world', 'hello world')).toBe(0)
  })

  it('returns word count when original is empty', () => {
    expect(maxConsecutiveWordChanges('', 'hello world')).toBe(2)
  })

  it('returns word count when corrected is empty', () => {
    expect(maxConsecutiveWordChanges('hello world', '')).toBe(2)
  })

  it('counts single changed word', () => {
    // LCS-based diff: KEEP(hello), REMOVE(world), ADD(universe) = 2 consecutive
    expect(maxConsecutiveWordChanges('hello world', 'hello universe')).toBe(2)
  })

  it('counts multiple consecutive changes', () => {
    // LCS-based diff: KEEP(i), REMOVE(like), REMOVE(big), REMOVE(cats), ADD(love), ADD(small), ADD(dogs)
    // = 6 consecutive operations after the KEEP
    expect(
      maxConsecutiveWordChanges('I like big cats', 'I love small dogs'),
    ).toBe(6)
  })

  it('finds max across non-consecutive changes', () => {
    // With LCS-based diff, operations are: KEEP(hello), REMOVE(cruel), ADD(nice), KEEP(world), REMOVE(out), REMOVE(there), ADD(over), ADD(here)
    // The longest consecutive change run is after 'world': remove out, remove there, add over, add here = 4
    expect(
      maxConsecutiveWordChanges(
        'hello cruel world out there',
        'hello nice world over here',
      ),
    ).toBe(4)
  })

  it('handles word merges without cascading misalignment', () => {
    // "lambda land" merged to "LambdaLith" - only 3 consecutive operations (remove, remove, add)
    const original =
      'I think this approach pushes you a little bit more into the lambda land, as we did in our particular example.'
    const corrected =
      'I think this approach pushes you a little bit more into the LambdaLith, as we did in our particular example.'
    const consecutive = maxConsecutiveWordChanges(original, corrected)
    expect(consecutive).toBe(3) // remove "lambda", remove "land,", add "lambdalith,"
  })

  it('handles full rewrite', () => {
    // LCS-based diff: no common words, so 4 removes + 4 adds = 8 consecutive
    expect(
      maxConsecutiveWordChanges('one two three four', 'five six seven eight'),
    ).toBe(8)
  })

  it('is case-insensitive', () => {
    expect(maxConsecutiveWordChanges('Hello World', 'hello world')).toBe(0)
  })
})

describe('validateCorrection', () => {
  describe('with default config', () => {
    it('accepts identical text as invalid (no-change)', () => {
      const result = validateCorrection('hello world', 'hello world')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('no-change')
    })

    it('accepts small targeted corrections', () => {
      // Fixing split word: "sage maker" -> "SageMaker"
      const result = validateCorrection('sage maker rocks', 'SageMaker rocks')
      expect(result.valid).toBe(true)
    })

    it('accepts duplicate word removal', () => {
      // "the the function" -> "the function"
      const result = validateCorrection('the the function', 'the function')
      expect(result.valid).toBe(true)
    })

    it('accepts technical term correction', () => {
      // "lamb da" -> "Lambda" - very short segment (2 words)
      // consecutive changes = 2 <= 3, so passes
      const result = validateCorrection('lamb da', 'Lambda')
      expect(result.valid).toBe(true)
    })

    it('accepts word merge corrections (lambda land -> LambdaLith)', () => {
      // This was incorrectly rejected with position-based comparison
      // LCS correctly identifies only 2-3 words changed out of ~20
      const result = validateCorrection(
        'I think this approach pushes you a little bit more into the lambda land, as we did in our particular example.',
        'I think this approach pushes you a little bit more into the LambdaLith, as we did in our particular example.',
      )
      expect(result.valid).toBe(true)
    })
  })

  describe('rejects full rewrites', () => {
    it('rejects complete sentence rewrite', () => {
      const result = validateCorrection(
        'So default in Lambda, that would be a one-to-one ratio',
        'So you can have up to 64 concurrent invocations',
      )
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('word-change-ratio')
    })

    it('rejects rephrased sentence', () => {
      const result = validateCorrection(
        'I think this approach pushes you a little bit more into the lambda land',
        "It's just something you need to consider",
      )
      expect(result.valid).toBe(false)
    })
  })

  describe('with minWordsForRatioCheck', () => {
    it('applies lenient rules for short segments', () => {
      // Short segment (< 5 words) - only checks consecutive changes
      const result = validateCorrection('face book', 'Facebook')
      expect(result.valid).toBe(true)
    })

    it('still rejects short segments with too many consecutive changes', () => {
      const result = validateCorrection(
        'one two three',
        'four five six',
        { maxConsecutiveChanges: 2 }, // Custom lower threshold
      )
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('consecutive-changes')
    })
  })

  describe('with custom config', () => {
    it('respects enabled: false', () => {
      const result = validateCorrection(
        'completely different sentence here',
        'nothing matches at all whatsoever',
        { enabled: false },
      )
      expect(result.valid).toBe(true)
    })

    it('respects custom maxWordChangeRatio', () => {
      // With default 0.4, "hello world foo bar baz" -> "hello universe foo bar baz" (1/5 = 0.2) passes
      // But "hello world" -> "goodbye universe" (2/2 = 1.0) fails even with 0.8
      // Test that lowering the threshold rejects previously acceptable changes
      const result = validateCorrection(
        'hello world foo bar baz',
        'hello universe foo bar baz',
        { maxWordChangeRatio: 0.1 }, // 0.2 > 0.1, should fail
      )
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('word-change-ratio')
    })

    it('respects custom maxNormalizedEditDistance', () => {
      // "hello world from the test suite" -> "hello universe from the test suite"
      // has small edit distance, so test that raising the threshold allows it
      const result = validateCorrection(
        'hello world from the test suite',
        'hello universe from the test suite',
        // Provide permissive values for all checks
        { maxWordChangeRatio: 1.0, maxNormalizedEditDistance: 1.0 },
      )
      expect(result.valid).toBe(true)
    })

    it('respects custom maxConsecutiveChanges', () => {
      // Use a short segment (< 5 words) to only trigger consecutive check
      const result = validateCorrection('a b c d', 'x y z d', {
        maxConsecutiveChanges: 2,
      })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('consecutive-changes')
    })
  })

  describe('edge cases', () => {
    it('handles empty strings', () => {
      const result = validateCorrection('', '')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('no-change')
    })

    it('handles original to empty', () => {
      // Short segment (2 words) - only checks consecutive changes
      // Empty result means 2 consecutive changes, which exceeds default of 3? No, 2 < 3
      // Actually for empty, maxConsecutiveWordChanges returns 2 (the word count of original)
      // 2 <= 3 so it passes. This is intentional - aggressive deletion could be valid in some cases
      const result = validateCorrection('hello world', '')
      expect(result.valid).toBe(true)
    })

    it('handles punctuation-only changes', () => {
      // Punctuation changes should generally pass
      const result = validateCorrection(
        'Hello world how are you doing',
        'Hello world, how are you doing',
      )
      expect(result.valid).toBe(true)
    })
  })
})

describe('DEFAULT_VALIDATION_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_VALIDATION_CONFIG.enabled).toBe(true)
    expect(DEFAULT_VALIDATION_CONFIG.maxWordChangeRatio).toBe(0.4)
    expect(DEFAULT_VALIDATION_CONFIG.maxNormalizedEditDistance).toBe(0.5)
    expect(DEFAULT_VALIDATION_CONFIG.maxConsecutiveChanges).toBe(3)
    expect(DEFAULT_VALIDATION_CONFIG.minWordsForRatioCheck).toBe(5)
  })
})
