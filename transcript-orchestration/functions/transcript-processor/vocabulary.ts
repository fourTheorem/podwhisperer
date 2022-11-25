import { MetricUnits } from "@aws-lambda-powertools/metrics"
import { logger, metrics } from "../lib/lambda-common"
import { MergedTranscript } from "./types"
type VocabularySubstitution = {
  type: 'literal'|'regex',
  search: string,
  replacement: string
}

export type VocabularySubstitutions = VocabularySubstitution[]

/**
 * Substitute vocabulary words in place using a custom set of word/phrase substitutions
 */
export function substituteVocabulary(transcript: MergedTranscript, vocabularySubstitutions: VocabularySubstitutions) : void {
  logger.info(`Substituting vocabulary with ${vocabularySubstitutions.length} substitutions in ${transcript.segments.length} segments`)

  let substitutionCount = 0
  for (const subst of vocabularySubstitutions) {
    logger.debug('Executing replacement')
    const pattern = subst.type === 'regex' ? new RegExp(subst.search, 'g') : subst.search

    for (const segment of transcript.segments) {
      const newText = segment.text.replace(pattern, subst.replacement)
      if (newText !== segment.text) {
        segment.text = newText
        substitutionCount++
      }
    }
  }
  metrics.addMetric('VocabSubstitutionCount', MetricUnits.Count, substitutionCount)
}