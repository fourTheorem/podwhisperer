import { describe, expect, it } from 'vitest'
import {
  buildSpeakerPrefix,
  escapeHtml,
  formatSrtTimestamp,
  formatVttTimestamp,
  getHighlightTag,
  highlightText,
} from './formatting'

describe('formatVttTimestamp', () => {
  it('should format zero seconds', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000')
  })

  it('should format seconds with milliseconds', () => {
    expect(formatVttTimestamp(1.5)).toBe('00:00:01.500')
  })

  it('should format minutes', () => {
    expect(formatVttTimestamp(65.25)).toBe('00:01:05.250')
  })

  it('should format hours', () => {
    expect(formatVttTimestamp(3661.123)).toBe('01:01:01.123')
  })

  it('should use period as milliseconds separator', () => {
    const result = formatVttTimestamp(1.5)
    expect(result).toContain('.')
    expect(result).not.toContain(',')
  })

  it('should handle edge case with 999 milliseconds', () => {
    expect(formatVttTimestamp(0.999)).toBe('00:00:00.999')
  })

  it('should round milliseconds correctly', () => {
    expect(formatVttTimestamp(0.2514)).toBe('00:00:00.251')
    expect(formatVttTimestamp(0.2516)).toBe('00:00:00.252')
  })
})

describe('formatSrtTimestamp', () => {
  it('should format zero seconds', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000')
  })

  it('should format seconds with milliseconds', () => {
    expect(formatSrtTimestamp(1.5)).toBe('00:00:01,500')
  })

  it('should format minutes', () => {
    expect(formatSrtTimestamp(65.25)).toBe('00:01:05,250')
  })

  it('should format hours', () => {
    expect(formatSrtTimestamp(3661.123)).toBe('01:01:01,123')
  })

  it('should use comma as milliseconds separator (French origin)', () => {
    const result = formatSrtTimestamp(1.5)
    expect(result).toContain(',')
  })
})

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('should escape less-than signs', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b')
  })

  it('should escape greater-than signs', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b')
  })

  it('should escape multiple special characters', () => {
    expect(escapeHtml('<script>alert("&")</script>')).toBe(
      '&lt;script&gt;alert("&amp;")&lt;/script&gt;',
    )
  })

  it('should return plain text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world')
  })
})

describe('getHighlightTag', () => {
  it('should return underline tags by default', () => {
    expect(getHighlightTag('underline')).toEqual({ open: '<u>', close: '</u>' })
  })

  it('should return bold tags', () => {
    expect(getHighlightTag('bold')).toEqual({ open: '<b>', close: '</b>' })
  })

  it('should return italic tags', () => {
    expect(getHighlightTag('italic')).toEqual({ open: '<i>', close: '</i>' })
  })
})

describe('highlightText', () => {
  it('should wrap text with underline tags', () => {
    expect(highlightText('word', 'underline')).toBe('<u>word</u>')
  })

  it('should wrap text with bold tags', () => {
    expect(highlightText('word', 'bold')).toBe('<b>word</b>')
  })

  it('should wrap text with italic tags', () => {
    expect(highlightText('word', 'italic')).toBe('<i>word</i>')
  })
})

describe('buildSpeakerPrefix', () => {
  describe('when includeSpeakerNames is "never"', () => {
    it('should return empty string', () => {
      expect(buildSpeakerPrefix('Alice', undefined, 'never')).toBe('')
    })

    it('should return empty string even with previous speaker', () => {
      expect(buildSpeakerPrefix('Alice', 'Bob', 'never')).toBe('')
    })
  })

  describe('when includeSpeakerNames is "always"', () => {
    it('should return speaker prefix', () => {
      expect(buildSpeakerPrefix('Alice', undefined, 'always')).toBe('Alice: ')
    })

    it('should return speaker prefix even when same as previous', () => {
      expect(buildSpeakerPrefix('Alice', 'Alice', 'always')).toBe('Alice: ')
    })

    it('should return empty string when no speaker', () => {
      expect(buildSpeakerPrefix(undefined, undefined, 'always')).toBe('')
    })
  })

  describe('when includeSpeakerNames is "when-changes"', () => {
    it('should return speaker prefix when no previous speaker', () => {
      expect(buildSpeakerPrefix('Alice', undefined, 'when-changes')).toBe(
        'Alice: ',
      )
    })

    it('should return speaker prefix when speaker changes', () => {
      expect(buildSpeakerPrefix('Alice', 'Bob', 'when-changes')).toBe('Alice: ')
    })

    it('should return empty string when speaker is same as previous', () => {
      expect(buildSpeakerPrefix('Alice', 'Alice', 'when-changes')).toBe('')
    })

    it('should return empty string when no speaker', () => {
      expect(buildSpeakerPrefix(undefined, 'Alice', 'when-changes')).toBe('')
    })
  })
})
