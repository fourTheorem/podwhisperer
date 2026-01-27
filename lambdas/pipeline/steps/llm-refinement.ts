/**
LLM-based transcript refinement using AWS Bedrock

This module provides transcript refinement by:
1. Converting transcript segments to plain text lines for LLM analysis
2. Sending to Bedrock Claude model for error detection
3. Reconciling corrections back with word-level timing data

Key algorithm: Uses LCS (Longest Common Subsequence) to diff original vs
corrected words, then intelligently merges/splits timing data.
*/

import {
  type BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import type { LlmRefinementConfig } from '@podwhisperer/config'
import type {
  IgnoredSuggestion,
  LlmRefinementStats,
  LlmRefinementUpdate,
  WhisperxResult,
} from '../types'
import {
  DEFAULT_VALIDATION_CONFIG,
  validateCorrection,
} from '../utils/correction-validator'
import {
  getSegmentWordsText,
  reconcileSegment,
  reconstructText,
  textToWords,
} from '../utils/segment-reconciliation'

// Re-export for test compatibility
export { reconcileSegment, reconstructText, textToWords }

const REFINEMENT_PROMPT_TEMPLATE = `You are a transcript editor. Your task is to fix ONLY obvious transcription errors - words that were clearly misheard or misspelled by the speech-to-text system.

## STRICT RULES - Read carefully

**DO correct:**
- Technical terms and proper nouns that were phonetically misheard (e.g., "aye phone" → "iPhone", "doctor smith" → "Dr. Smith")
- Words split incorrectly by the transcriber (e.g., "face book" → "Facebook", "new york" → "New York")
- Obvious homophones that are wrong in context (e.g., "there" vs "their" when clearly wrong)
- Duplicated words from transcription errors (e.g., "the the" → "the")

**DO NOT:**
- Rephrase or reword sentences
- Change sentence structure
- Add words that weren't spoken
- Remove words unless they are duplicated transcription errors
- "Improve" grammar or style
- Change filler words (um, uh, like) - leave them as-is
- Make subjective changes

**When in doubt, leave it unchanged.** The goal is to fix machine transcription errors, not to edit the speakers' words.

## Examples of GOOD vs BAD corrections

**GOOD corrections** (these ARE transcription errors - make these fixes):
- "sage maker" → "SageMaker" (split technical term)
- "lamb da" → "Lambda" (split word)
- "the the function" → "the function" (duplicate word)
- "new york" → "New York" (proper noun)
- "aye phone" → "iPhone" (phonetically misheard)

**BAD corrections** (do NOT make these changes):
- "So default in Lambda, that would be..." → "So you can have up to..." (complete rewrite - WRONG)
- "I think we should probably consider" → "We should consider" (removing hedging - WRONG)
- "um so basically what happens" → "what happens" (removing fillers - WRONG)
- "it's like really fast" → "it's very fast" (style improvement - WRONG)
- "I think this approach pushes you" → "This approach pushes you" (removing speaker's voice - WRONG)

**Rule of thumb:** If more than 2-3 words need changing, it's probably NOT a transcription error. Leave it unchanged.

{{ADDITIONAL_CONTEXT}}

## Speaker Identification
If additional context is provided above, use any information about speakers (names, roles, or speaking patterns) to identify them. Otherwise, keep the original SPEAKER_XX labels for unknown speakers.

## Input format
Plain text lines with index and speaker prefix:
\`\`\`
[0] [SPEAKER_00] Hello and welcome to the show.
[1] [SPEAKER_01] Thanks for having me.
\`\`\`

## Output format
\`\`\`json
{
  "identifiedSpeakers": {
    "SPEAKER_00": "Name or SPEAKER_00 if unknown",
    "SPEAKER_01": "Name or SPEAKER_01 if unknown"
  },
  "updates": [
    { "idx": 1, "text": "Corrected text here." }
  ]
}
\`\`\`

Only include updates for lines with genuine transcription errors. Most lines should NOT need changes. Do not report lines with no changes.

## Transcript to analyze

{{TRANSCRIPT}}
`

interface LlmResponse {
  identifiedSpeakers?: Record<string, string>
  updates?: Array<{ idx: number; text: string }>
}

export async function llmRefinement(
  transcript: WhisperxResult,
  config: LlmRefinementConfig,
  bedrockClient: BedrockRuntimeClient,
): Promise<LlmRefinementStats> {
  const stats: LlmRefinementStats = {
    segmentsProcessed: transcript.segments.length,
    segmentsUpdated: 0,
    speakersIdentified: 0,
    speakerMapping: {},
    updates: [],
    ignoredSuggestions: [],
    llmResponseTimeMs: 0,
  }

  // Merge validation config with defaults
  const validationConfig = {
    ...DEFAULT_VALIDATION_CONFIG,
    ...config.suggestionValidation,
  }

  if (transcript.segments.length === 0) {
    return stats
  }

  // Convert transcript to plain text lines
  const lines = toPlainTextLines(transcript)
  const prompt = buildPrompt(config.additionalContext, lines)

  // Call Bedrock
  const modelInput = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: config.modelConfig.max_tokens,
    temperature: config.modelConfig.temperature,
    stop_sequences: [],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  })

  const invokeCommand = new InvokeModelCommand({
    body: modelInput,
    modelId: config.bedrockInferenceProfileId, // Cross-region inference profile ID
    accept: 'application/json',
    contentType: 'application/json',
  })

  const startTime = Date.now()
  const modelResponse = await bedrockClient.send(invokeCommand)
  stats.llmResponseTimeMs = Date.now() - startTime

  const raw = await modelResponse.body.transformToString('utf8')
  const parsed = JSON.parse(raw)
  const outputText =
    parsed?.content?.find((c: { type: string }) => c.type === 'text')?.text ??
    ''

  // Parse LLM response
  const llmResponse = parseLlmResponse(outputText)
  if (!llmResponse) {
    return stats
  }

  // Apply speaker mapping
  const speakerMapping = llmResponse.identifiedSpeakers || {}
  stats.speakerMapping = speakerMapping
  stats.speakersIdentified = Object.keys(speakerMapping).length

  if (stats.speakersIdentified > 0) {
    applySpeakerMapping(transcript, speakerMapping)
  }

  // Apply text updates
  const llmUpdates = llmResponse.updates || []
  for (const update of llmUpdates) {
    const idx = update.idx
    if (idx < 0 || idx >= transcript.segments.length) {
      continue
    }

    const segment = transcript.segments[idx]
    const originalText = getSegmentWordsText(segment)

    // Skip if no actual change
    if (originalText === update.text) {
      const ignored: IgnoredSuggestion = {
        originalText,
        correctedText: update.text,
        ignoreReason: 'no-change',
      }
      stats.ignoredSuggestions.push(ignored)
      continue
    }

    // Validate the correction before applying
    const validationResult = validateCorrection(
      originalText,
      update.text,
      validationConfig,
    )

    if (!validationResult.valid && validationResult.reason) {
      const ignored: IgnoredSuggestion = {
        originalText,
        correctedText: update.text,
        ignoreReason: validationResult.reason,
      }
      stats.ignoredSuggestions.push(ignored)
      continue
    }

    const patchedWords = textToWords(update.text)

    // Track the update
    const refinementUpdate: LlmRefinementUpdate = {
      originalText,
      correctedText: update.text,
    }
    stats.updates.push(refinementUpdate)
    stats.segmentsUpdated++

    // Apply reconciliation
    reconcileSegment(segment, patchedWords)
  }

  return stats
}

// Converts transcript to indexed plain text lines for LLM
// Uses words array (not text field) to ensure consistency
function toPlainTextLines(transcript: WhisperxResult): string[] {
  return transcript.segments.map((seg, i) => {
    const wordsText = getSegmentWordsText(seg)
    return `[${i}] [${seg.speaker ?? 'SPEAKER_00'}] ${wordsText}`
  })
}

// Builds the prompt using hardcoded template with optional additional context
function buildPrompt(
  additionalContext: string | undefined,
  lines: string[],
): string {
  const linesText = lines.join('\n')
  let prompt = REFINEMENT_PROMPT_TEMPLATE.replace('{{TRANSCRIPT}}', linesText)

  if (additionalContext) {
    const contextSection = `## Additional Context\n\n${additionalContext}\n\n`
    prompt = prompt.replace('{{ADDITIONAL_CONTEXT}}', contextSection)
  } else {
    prompt = prompt.replace('{{ADDITIONAL_CONTEXT}}', '')
  }

  return prompt
}

// Parses LLM JSON response, extracting identifiedSpeakers and updates
function parseLlmResponse(responseText: string): LlmResponse | null {
  const jsonStart = responseText.indexOf('{')
  const jsonEnd = responseText.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return null
  }

  try {
    const jsonPart = responseText.substring(jsonStart, jsonEnd + 1)
    return JSON.parse(jsonPart)
  } catch {
    return null
  }
}

// Applies speaker mapping to all segments and words in the transcript
function applySpeakerMapping(
  transcript: WhisperxResult,
  speakerMapping: Record<string, string>,
): void {
  for (const seg of transcript.segments) {
    if (seg.speaker && speakerMapping[seg.speaker]) {
      seg.speaker = speakerMapping[seg.speaker]
    }

    if (seg.words) {
      for (const word of seg.words) {
        if (word.speaker && speakerMapping[word.speaker]) {
          word.speaker = speakerMapping[word.speaker]
        }
      }
    }
  }
}
