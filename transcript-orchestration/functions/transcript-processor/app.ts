import { logger, middify } from '../lib/lambda-common.js'
import { TranscribeSpeakerSegment, WhisperSegment } from './types.js'
import { S3Client } from '@aws-sdk/client-s3'
import { getS3JSON, putS3JSON } from '../lib/utils.js'
import { merge } from './process-transcripts.js'
import { substituteVocabulary, VocabularySubstitutions } from './vocabulary'
import envs from '../lib/envs'

type TranscriptEvent = {
  whisperOutputKey: string,
  transcribeOutputKey: string,
  processedTranscriptKey: string
}

const s3Client = new S3Client({})

const { BUCKET_NAME } = envs

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event: TranscriptEvent) => {
  logger.info('Fetching whisper and transcribe outputs', { event })

  const [whisperOutput, transcribeOutput] = await Promise.all([
    getS3JSON(s3Client, BUCKET_NAME, event.whisperOutputKey),
    getS3JSON(s3Client, BUCKET_NAME, event.transcribeOutputKey)
  ])

  const whisperSegments: WhisperSegment[] = whisperOutput.result.segments.map((segment: any) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text
  }))

  const transcribeSegments: TranscribeSpeakerSegment[] = transcribeOutput.results.speaker_labels.segments.map((segment: any) => ({
    start: segment.start_time,
    end: segment.end_time,
    speakerLabel: segment.speaker_label
  }))

  logger.info('Merging whisper and transcribe segments')
  const mergedTranscript = merge(whisperSegments, transcribeSegments)

  logger.info('Segments merged')
  let vocabularySubstitutions
  try {
    vocabularySubstitutions = await getS3JSON(s3Client, BUCKET_NAME, 'vocabulary-substitutions.json') as any as VocabularySubstitutions
  } catch (err) {
    logger.warn('Unable to retrieve vocabulary substitutions', { err })
  }

  if (vocabularySubstitutions) {
    substituteVocabulary(mergedTranscript, vocabularySubstitutions)
  }
  await putS3JSON(s3Client, BUCKET_NAME, event.processedTranscriptKey, mergedTranscript)
  return null
}) as unknown as ((event: TranscriptEvent) => Promise<null>) 
