import type { CaptionsConfig } from '@podwhisperer/config'

/**
 * Format seconds to VTT timestamp: HH:MM:SS.TTT
 * VTT uses a period for milliseconds separator.
 */
export function formatVttTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 * SRT uses a comma for milliseconds separator (French origin).
 */
export function formatSrtTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

/**
 * Escape HTML special characters to prevent tag conflicts in VTT/SRT.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Get the highlight tag based on configuration.
 */
export function getHighlightTag(
  highlightWith: CaptionsConfig['highlightWith'],
): { open: string; close: string } {
  switch (highlightWith) {
    case 'bold':
      return { open: '<b>', close: '</b>' }
    case 'italic':
      return { open: '<i>', close: '</i>' }
    default:
      return { open: '<u>', close: '</u>' }
  }
}

/**
 * Wrap text with highlight tags.
 */
export function highlightText(
  text: string,
  highlightWith: CaptionsConfig['highlightWith'],
): string {
  const { open, close } = getHighlightTag(highlightWith)
  return `${open}${text}${close}`
}

/**
 * Build the speaker prefix based on configuration.
 * @param speaker The speaker name/label
 * @param previousSpeaker The previous segment's speaker (for 'when-changes' mode)
 * @param includeSpeakerNames The configuration option
 */
export function buildSpeakerPrefix(
  speaker: string | undefined,
  previousSpeaker: string | undefined,
  includeSpeakerNames: CaptionsConfig['includeSpeakerNames'],
): string {
  if (includeSpeakerNames === 'never') {
    return ''
  }

  if (includeSpeakerNames === 'always') {
    return speaker ? `${speaker}: ` : ''
  }

  // 'when-changes' mode
  if (speaker && speaker !== previousSpeaker) {
    return `${speaker}: `
  }

  return ''
}
