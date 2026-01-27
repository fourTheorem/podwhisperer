import type { ReplacementRule } from '@podwhisperer/config'
import { describe, expect, it } from 'vitest'
import type { WhisperxResult } from '../types'
import { applyReplacements, ruleToKey } from './replacement'

describe('applyReplacements', () => {
  describe('literal substitution', () => {
    it('should replace single occurrence', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello Owen',
            words: [
              { word: 'Hello', start: 0, end: 0.5 },
              { word: 'Owen', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Hello Eoin')
      expect(result.segments[0].words?.[1].word).toBe('Eoin')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should replace multiple occurrences in same text', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'AWS Bytes is the best. I love AWS Bytes!',
            words: [
              { word: 'AWS', start: 0, end: 0.2 },
              { word: 'Bytes', start: 0.2, end: 0.4 },
              { word: 'is', start: 0.4, end: 0.5 },
              { word: 'the', start: 0.5, end: 0.6 },
              { word: 'best.', start: 0.6, end: 0.8 },
              { word: 'I', start: 0.8, end: 0.9 },
              { word: 'love', start: 0.9, end: 1.1 },
              { word: 'AWS', start: 1.1, end: 1.3 },
              { word: 'Bytes!', start: 1.3, end: 1.5 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'AWS Bytes', replacement: 'AWS Bites' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe(
        'AWS Bites is the best. I love AWS Bites!',
      )
      expect(result.segments[0].words?.[1].word).toBe('Bites')
      expect(result.segments[0].words?.[8].word).toBe('Bites!')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should be case sensitive for literal matches', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'owen is here, Owen is there',
            words: [
              { word: 'owen', start: 0, end: 0.2 },
              { word: 'is', start: 0.2, end: 0.3 },
              { word: 'here,', start: 0.3, end: 0.5 },
              { word: 'Owen', start: 0.5, end: 0.7 },
              { word: 'is', start: 0.7, end: 0.8 },
              { word: 'there', start: 0.8, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('owen is here, Eoin is there')
      expect(result.segments[0].words?.[0].word).toBe('owen')
      expect(result.segments[0].words?.[3].word).toBe('Eoin')
    })
  })

  describe('regex substitution', () => {
    it('should replace using simple pattern', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Duciano said hello',
            words: [
              { word: 'Duciano', start: 0, end: 0.3 },
              { word: 'said', start: 0.3, end: 0.5 },
              { word: 'hello', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'regex', search: '[A-Z]uciano', replacement: 'Luciano' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Luciano said hello')
      expect(result.segments[0].words?.[0].word).toBe('Luciano')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should support capture groups', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'The date is 2024-01-15',
            words: [
              { word: 'The', start: 0, end: 0.2 },
              { word: 'date', start: 0.2, end: 0.4 },
              { word: 'is', start: 0.4, end: 0.5 },
              { word: '2024-01-15', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        {
          type: 'regex',
          search: '(\\d{4})-(\\d{2})-(\\d{2})',
          replacement: '$2/$3/$1',
        },
      ]

      applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('The date is 01/15/2024')
      expect(result.segments[0].words?.[3].word).toBe('01/15/2024')
    })

    it('should replace all matches with global regex', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Muciano and Duciano',
            words: [
              { word: 'Muciano', start: 0, end: 0.3 },
              { word: 'and', start: 0.3, end: 0.5 },
              { word: 'Duciano', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'regex', search: '[MD]uciano', replacement: 'Luciano' },
      ]

      applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Luciano and Luciano')
      expect(result.segments[0].words?.[0].word).toBe('Luciano')
      expect(result.segments[0].words?.[2].word).toBe('Luciano')
    })
  })

  describe('mixed rules', () => {
    it('should apply both literal and regex rules', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Duciano from Fortiorum',
            words: [
              { word: 'Duciano', start: 0, end: 0.3 },
              { word: 'from', start: 0.3, end: 0.5 },
              { word: 'Fortiorum', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'regex', search: '[A-Z]uciano', replacement: 'Luciano' },
        { type: 'literal', search: 'Fortiorum', replacement: 'fourTheorem' },
      ]

      applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Luciano from fourTheorem')
      expect(result.segments[0].words?.[0].word).toBe('Luciano')
      expect(result.segments[0].words?.[2].word).toBe('fourTheorem')
    })
  })

  describe('empty rules array', () => {
    it('should return zero stats with empty rules', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello world',
            words: [
              { word: 'Hello', start: 0, end: 0.5 },
              { word: 'world', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const stats = applyReplacements(result, [])

      expect(result.segments[0].text).toBe('Hello world')
      expect(stats.segmentsModified).toBe(0)
      expect(stats.wordChanges).toBe(0)
    })
  })

  describe('segments with words array', () => {
    it('should update both segment text and individual words', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: "My name is Luciano and I'm joined by Owen",
            words: [
              { word: 'My', start: 0, end: 0.1 },
              { word: 'name', start: 0.1, end: 0.2 },
              { word: 'is', start: 0.2, end: 0.3 },
              { word: 'Luciano', start: 0.3, end: 0.5 },
              { word: 'and', start: 0.5, end: 0.6 },
              { word: "I'm", start: 0.6, end: 0.7 },
              { word: 'joined', start: 0.7, end: 0.8 },
              { word: 'by', start: 0.8, end: 0.9 },
              { word: 'Owen', start: 0.9, end: 1.0 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe(
        "My name is Luciano and I'm joined by Eoin",
      )
      expect(result.segments[0].words?.[8].word).toBe('Eoin')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should handle segment with no words array', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello Owen',
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Hello Eoin')
      expect(stats.segmentsModified).toBe(1)
    })
  })

  describe('rules that do not match', () => {
    it('should return zero stats when no matches found', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello world',
            words: [
              { word: 'Hello', start: 0, end: 0.5 },
              { word: 'world', start: 0.5, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
        { type: 'regex', search: 'nonexistent\\d+', replacement: 'replaced' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Hello world')
      expect(stats.segmentsModified).toBe(0)
      expect(stats.wordChanges).toBe(0)
    })
  })

  describe('multiple segments', () => {
    it('should process all segments correctly', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 135.475,
            end: 138.384,
            text: " My name is Luciano and I'm joined by Owen and this is AWS Bytes.",
            speaker: 'SPEAKER_01',
            words: [
              { word: 'My', start: 135.475, end: 135.6 },
              { word: 'name', start: 135.6, end: 135.7 },
              { word: 'is', start: 135.7, end: 135.796 },
              { word: 'Luciano', start: 135.796, end: 136.178 },
              { word: 'and', start: 136.178, end: 136.4 },
              { word: "I'm", start: 136.4, end: 136.5 },
              { word: 'joined', start: 136.5, end: 136.65 },
              { word: 'by', start: 136.65, end: 136.779 },
              { word: 'Owen', start: 136.779, end: 137.0 },
              { word: 'and', start: 137.0, end: 137.2 },
              { word: 'this', start: 137.2, end: 137.4 },
              { word: 'is', start: 137.4, end: 137.6 },
              { word: 'AWS', start: 137.843, end: 138.103 },
              { word: 'Bytes.', start: 138.144, end: 138.384 },
            ],
          },
          {
            start: 146.279,
            end: 148.1,
            text: ' AWS Bytes is brought to you by Fortiorum.',
            speaker: 'SPEAKER_01',
            words: [
              { word: 'AWS', start: 146.279, end: 146.619 },
              { word: 'Bytes', start: 146.679, end: 146.939 },
              { word: 'is', start: 146.939, end: 147.0 },
              { word: 'brought', start: 147.0, end: 147.2 },
              { word: 'to', start: 147.2, end: 147.3 },
              { word: 'you', start: 147.3, end: 147.4 },
              { word: 'by', start: 147.4, end: 147.5 },
              { word: 'Fortiorum.', start: 147.64, end: 148.1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
        { type: 'literal', search: 'AWS Bytes', replacement: 'AWS Bites' },
        { type: 'literal', search: 'Fortiorum', replacement: 'fourTheorem' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe(
        "My name is Luciano and I'm joined by Eoin and this is AWS Bites.",
      )
      expect(result.segments[0].words?.[8].word).toBe('Eoin')
      expect(result.segments[0].words?.[13].word).toBe('Bites.')

      expect(result.segments[1].text).toBe(
        'AWS Bites is brought to you by fourTheorem.',
      )
      expect(result.segments[1].words?.[1].word).toBe('Bites')
      expect(result.segments[1].words?.[7].word).toBe('fourTheorem.')

      expect(stats.segmentsModified).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('should handle empty segments array', () => {
      const result: WhisperxResult = {
        segments: [],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      const stats = applyReplacements(result, rules)

      expect(stats.segmentsModified).toBe(0)
      expect(stats.wordChanges).toBe(0)
    })

    it('should handle empty words array', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello Owen',
            words: [],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Hello Eoin')
      expect(stats.segmentsModified).toBe(1)
    })
  })

  describe('multi-word replacements (main fix)', () => {
    it('should handle multi-word replacement with same word count', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1.2,
            text: 'Welcome to AWS Bytes',
            words: [
              { word: 'Welcome', start: 0.0, end: 0.3 },
              { word: 'to', start: 0.3, end: 0.5 },
              { word: 'AWS', start: 0.5, end: 0.8 },
              { word: 'Bytes', start: 0.8, end: 1.2 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'AWS Bytes', replacement: 'AWS Bites' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Welcome to AWS Bites')
      expect(result.segments[0].words?.[2].word).toBe('AWS')
      expect(result.segments[0].words?.[3].word).toBe('Bites')
      // Timing should be preserved
      expect(result.segments[0].words?.[3].start).toBe(0.8)
      expect(result.segments[0].words?.[3].end).toBe(1.2)
      expect(stats.segmentsModified).toBe(1)
    })

    it('should handle contraction: 2 words to 1 word with merged timing', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1.2,
            text: 'I love sage maker',
            words: [
              { word: 'I', start: 0.0, end: 0.3 },
              { word: 'love', start: 0.3, end: 0.6 },
              { word: 'sage', start: 0.6, end: 0.9 },
              { word: 'maker', start: 0.9, end: 1.2 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'sage maker', replacement: 'SageMaker' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('I love SageMaker')
      expect(result.segments[0].words?.length).toBe(3)
      expect(result.segments[0].words?.[2].word).toBe('SageMaker')
      // When removed words extend previous word, new word splits from that extended timing
      // "love" ends up extended from 0.3-1.2, then SageMaker splits at midpoint
      expect(result.segments[0].words?.[2].start).toBe(0.75) // midpoint of (0.3+1.2)/2
      expect(result.segments[0].words?.[2].end).toBe(1.2)
      expect(stats.segmentsModified).toBe(1)
      expect(stats.wordChanges).toBe(1) // Reduced from 4 to 3 words
    })

    it('should handle expansion: 1 word to 2 words with split timing', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1.2,
            text: 'cannot do this',
            words: [
              { word: 'cannot', start: 0.0, end: 0.6 },
              { word: 'do', start: 0.6, end: 0.9 },
              { word: 'this', start: 0.9, end: 1.2 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'cannot', replacement: 'can not' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('can not do this')
      expect(result.segments[0].words?.length).toBe(4)
      expect(result.segments[0].words?.[0].word).toBe('can')
      expect(result.segments[0].words?.[1].word).toBe('not')
      // Timing should be split at midpoint
      expect(result.segments[0].words?.[0].start).toBe(0.0)
      expect(result.segments[0].words?.[0].end).toBe(0.3) // midpoint
      expect(result.segments[0].words?.[1].start).toBe(0.3)
      expect(result.segments[0].words?.[1].end).toBe(0.6) // original end
      expect(stats.segmentsModified).toBe(1)
      expect(stats.wordChanges).toBe(1) // Increased from 3 to 4 words
    })

    it('should preserve punctuation during multi-word replacement', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello, AWS Bytes.',
            words: [
              { word: 'Hello,', start: 0, end: 0.3 },
              { word: 'AWS', start: 0.3, end: 0.6 },
              { word: 'Bytes.', start: 0.6, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'AWS Bytes', replacement: 'AWS Bites' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('Hello, AWS Bites.')
      expect(result.segments[0].words?.[0].word).toBe('Hello,')
      expect(result.segments[0].words?.[1].word).toBe('AWS')
      expect(result.segments[0].words?.[2].word).toBe('Bites.')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should handle multiple multi-word replacements in same segment', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'sage maker and lamb da',
            words: [
              { word: 'sage', start: 0.0, end: 0.3 },
              { word: 'maker', start: 0.3, end: 0.6 },
              { word: 'and', start: 0.6, end: 0.8 },
              { word: 'lamb', start: 0.8, end: 1.2 },
              { word: 'da', start: 1.2, end: 1.5 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'sage maker', replacement: 'SageMaker' },
        { type: 'literal', search: 'lamb da', replacement: 'Lambda' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('SageMaker and Lambda')
      expect(result.segments[0].words?.length).toBe(3)
      expect(result.segments[0].words?.[0].word).toBe('SageMaker')
      expect(result.segments[0].words?.[1].word).toBe('and')
      expect(result.segments[0].words?.[2].word).toBe('Lambda')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should handle regex multi-word replacement', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'E C 2 instance',
            words: [
              { word: 'E', start: 0.0, end: 0.2 },
              { word: 'C', start: 0.2, end: 0.4 },
              { word: '2', start: 0.4, end: 0.6 },
              { word: 'instance', start: 0.6, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'regex', search: 'E\\s+C\\s+2', replacement: 'EC2' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('EC2 instance')
      expect(result.segments[0].words?.length).toBe(2)
      expect(result.segments[0].words?.[0].word).toBe('EC2')
      expect(result.segments[0].words?.[1].word).toBe('instance')
      expect(stats.segmentsModified).toBe(1)
    })

    it('should handle complete text replacement with LCS timing', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'foo bar baz',
            words: [
              { word: 'foo', start: 0.0, end: 0.3 },
              { word: 'bar', start: 0.3, end: 0.6 },
              { word: 'baz', start: 0.6, end: 1 },
            ],
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'foo bar baz', replacement: 'hello world' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('hello world')
      expect(result.segments[0].words?.length).toBe(2)
      expect(stats.segmentsModified).toBe(1)
    })
  })

  describe('backwards compatibility', () => {
    it('should handle segment without words array (fallback to text)', () => {
      const result: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'AWS Bytes rocks',
          },
        ],
      }

      const rules: ReplacementRule[] = [
        { type: 'literal', search: 'AWS Bytes', replacement: 'AWS Bites' },
      ]

      const stats = applyReplacements(result, rules)

      expect(result.segments[0].text).toBe('AWS Bites rocks')
      expect(result.segments[0].words).toBeUndefined()
      expect(stats.segmentsModified).toBe(1)
    })
  })
})

describe('ruleToKey', () => {
  it('should format literal rule as search->replacement', () => {
    const rule: ReplacementRule = {
      type: 'literal',
      search: 'Owen',
      replacement: 'Eoin',
    }

    expect(ruleToKey(rule)).toBe('Owen->Eoin')
  })

  it('should format regex rule with r prefix and quotes', () => {
    const rule: ReplacementRule = {
      type: 'regex',
      search: 'E\\s+C\\s+2',
      replacement: 'EC2',
    }

    expect(ruleToKey(rule)).toBe("r'E\\s+C\\s+2'->EC2")
  })

  it('should preserve special characters in search and replacement', () => {
    const rule: ReplacementRule = {
      type: 'literal',
      search: 'foo->bar',
      replacement: 'baz->qux',
    }

    expect(ruleToKey(rule)).toBe('foo->bar->baz->qux')
  })
})

describe('replacementCounts tracking', () => {
  it('should track single rule applied once', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Hello Owen',
          words: [
            { word: 'Hello', start: 0, end: 0.5 },
            { word: 'Owen', start: 0.5, end: 1 },
          ],
        },
      ],
    }

    const rules: ReplacementRule[] = [
      { type: 'literal', search: 'Owen', replacement: 'Eoin' },
    ]

    const stats = applyReplacements(result, rules)

    expect(stats.replacementCounts).toEqual({ 'Owen->Eoin': 1 })
  })

  it('should track single rule applied multiple times in same segment', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 2,
          text: 'Owen met Owen',
          words: [
            { word: 'Owen', start: 0, end: 0.3 },
            { word: 'met', start: 0.3, end: 0.6 },
            { word: 'Owen', start: 0.6, end: 1 },
          ],
        },
      ],
    }

    const rules: ReplacementRule[] = [
      { type: 'literal', search: 'Owen', replacement: 'Eoin' },
    ]

    const stats = applyReplacements(result, rules)

    expect(stats.replacementCounts).toEqual({ 'Owen->Eoin': 2 })
  })

  it('should track single rule applied across multiple segments', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Hello Owen',
          words: [
            { word: 'Hello', start: 0, end: 0.5 },
            { word: 'Owen', start: 0.5, end: 1 },
          ],
        },
        {
          start: 1,
          end: 2,
          text: 'Owen says hi',
          words: [
            { word: 'Owen', start: 1, end: 1.3 },
            { word: 'says', start: 1.3, end: 1.6 },
            { word: 'hi', start: 1.6, end: 2 },
          ],
        },
        {
          start: 2,
          end: 3,
          text: 'Goodbye Owen',
          words: [
            { word: 'Goodbye', start: 2, end: 2.5 },
            { word: 'Owen', start: 2.5, end: 3 },
          ],
        },
      ],
    }

    const rules: ReplacementRule[] = [
      { type: 'literal', search: 'Owen', replacement: 'Eoin' },
    ]

    const stats = applyReplacements(result, rules)

    expect(stats.replacementCounts).toEqual({ 'Owen->Eoin': 3 })
  })

  it('should track multiple rules with different counts', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Owen uses E C 2',
          words: [
            { word: 'Owen', start: 0, end: 0.2 },
            { word: 'uses', start: 0.2, end: 0.4 },
            { word: 'E', start: 0.4, end: 0.5 },
            { word: 'C', start: 0.5, end: 0.6 },
            { word: '2', start: 0.6, end: 0.7 },
          ],
        },
        {
          start: 1,
          end: 2,
          text: 'Owen loves E C 2',
          words: [
            { word: 'Owen', start: 1, end: 1.2 },
            { word: 'loves', start: 1.2, end: 1.4 },
            { word: 'E', start: 1.4, end: 1.5 },
            { word: 'C', start: 1.5, end: 1.6 },
            { word: '2', start: 1.6, end: 1.7 },
          ],
        },
      ],
    }

    const rules: ReplacementRule[] = [
      { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      { type: 'regex', search: 'E\\s+C\\s+2', replacement: 'EC2' },
    ]

    const stats = applyReplacements(result, rules)

    expect(stats.replacementCounts).toEqual({
      'Owen->Eoin': 2,
      "r'E\\s+C\\s+2'->EC2": 2,
    })
  })

  it('should not include rules with no matches in replacementCounts', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Hello world',
          words: [
            { word: 'Hello', start: 0, end: 0.5 },
            { word: 'world', start: 0.5, end: 1 },
          ],
        },
      ],
    }

    const rules: ReplacementRule[] = [
      { type: 'literal', search: 'Owen', replacement: 'Eoin' },
      { type: 'regex', search: 'nonexistent\\d+', replacement: 'replaced' },
    ]

    const stats = applyReplacements(result, rules)

    expect(stats.replacementCounts).toEqual({})
  })

  it('should return empty replacementCounts with empty rules', () => {
    const result: WhisperxResult = {
      segments: [
        {
          start: 0,
          end: 1,
          text: 'Hello world',
          words: [
            { word: 'Hello', start: 0, end: 0.5 },
            { word: 'world', start: 0.5, end: 1 },
          ],
        },
      ],
    }

    const stats = applyReplacements(result, [])

    expect(stats.replacementCounts).toEqual({})
  })
})
