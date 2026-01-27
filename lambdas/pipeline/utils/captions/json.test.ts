import type { CaptionsConfig } from '@podwhisperer/config'
import { describe, expect, it } from 'vitest'
import type { WhisperxResult } from '../../types'
import { generateJson } from './json'

const defaultConfig: CaptionsConfig = {
  generateVtt: true,
  generateSrt: true,
  generateSimplifiedJson: true,
  highlightWords: false,
  highlightWith: 'underline',
  includeSpeakerNames: 'when-changes',
}

describe('generateJson', () => {
  describe('basic functionality', () => {
    it('should generate valid JSON with speakers and segments', () => {
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

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.speakers).toBeDefined()
      expect(parsed.segments).toHaveLength(2)
    })

    it('should create speaker mapping with short labels', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 2.5, text: 'Hello', speaker: 'Luciano' },
          { start: 2.5, end: 5.0, text: 'Hi', speaker: 'Eoin' },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      // Should have two speakers with short labels
      expect(Object.keys(parsed.speakers)).toHaveLength(2)
      expect(parsed.speakers.spk_0).toBe('Eoin') // Alphabetically first
      expect(parsed.speakers.spk_1).toBe('Luciano')
    })

    it('should convert segments with correct structure', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 2.5, text: '  Hello, world.  ', speaker: 'Alice' },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.segments[0]).toEqual({
        speakerLabel: 'spk_0',
        start: 0,
        end: 2.5,
        text: 'Hello, world.', // trimmed
      })
    })
  })

  describe('speaker extraction', () => {
    it('should extract speakers from segment-level speaker field', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Hello', speaker: 'Alice' },
          { start: 1, end: 2, text: 'Hi', speaker: 'Bob' },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(Object.values(parsed.speakers).sort()).toEqual(['Alice', 'Bob'])
    })

    it('should extract speakers from word-level speaker field', () => {
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 2,
            text: 'Hello world',
            words: [
              { word: 'Hello', start: 0, end: 1, speaker: 'Alice' },
              { word: 'world', start: 1, end: 2, speaker: 'Bob' },
            ],
          },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(Object.values(parsed.speakers).sort()).toEqual(['Alice', 'Bob'])
    })

    it('should add default speaker when no speakers found', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello' }],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.speakers.spk_0).toBe('SPEAKER_00')
    })

    it('should handle SPEAKER_XX format speakers', () => {
      const transcript: WhisperxResult = {
        segments: [
          { start: 0, end: 1, text: 'Hello', speaker: 'SPEAKER_00' },
          { start: 1, end: 2, text: 'Hi', speaker: 'SPEAKER_01' },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(Object.values(parsed.speakers).sort()).toEqual([
        'SPEAKER_00',
        'SPEAKER_01',
      ])
    })
  })

  describe('edge cases', () => {
    it('should handle empty segments array', () => {
      const transcript: WhisperxResult = { segments: [] }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.segments).toEqual([])
      // Should still have default speaker
      expect(parsed.speakers.spk_0).toBe('SPEAKER_00')
    })

    it('should handle segment without speaker, using first word speaker', () => {
      const transcript: WhisperxResult = {
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Hello',
            words: [{ word: 'Hello', start: 0, end: 1, speaker: 'Alice' }],
          },
        ],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.segments[0].speakerLabel).toBe('spk_0')
      expect(parsed.speakers.spk_0).toBe('Alice')
    })

    it('should fallback to SPEAKER_00 when no speaker info available', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello' }],
      }

      const result = generateJson({ transcript, config: defaultConfig })
      const parsed = JSON.parse(result)

      expect(parsed.segments[0].speakerLabel).toBe('spk_0')
    })

    it('should produce properly formatted JSON', () => {
      const transcript: WhisperxResult = {
        segments: [{ start: 0, end: 1, text: 'Hello', speaker: 'Alice' }],
      }

      const result = generateJson({ transcript, config: defaultConfig })

      // Should be pretty-printed with 2-space indentation
      expect(result).toContain('\n')
      expect(result).toContain('  ')

      // Should be valid JSON
      expect(() => JSON.parse(result)).not.toThrow()
    })
  })
})
