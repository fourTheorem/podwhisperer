import { logger, middify } from '../lib/lambda-common.js'
import { TranscribeSpeakerSegment, WhisperSegment } from './types.js'
import { S3Client } from '@aws-sdk/client-s3'
import { getS3JSON, putS3JSON } from '../lib/utils.js'
import { merge } from './process-transcripts.js'

const { BUCKET_NAME } = process.env
if (!BUCKET_NAME) {
  throw new Error('BUCKET_NAME must be set')
}

type TranscriptEvent = {
  whisperOutputKey: string,
  transcribeOutputKey: string,
  processedTranscriptKey: string
}

const s3Client = new S3Client({})

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
  const mergedSegments = merge(whisperSegments, transcribeSegments)

  logger.info('Transcript processed')

  await putS3JSON(s3Client, BUCKET_NAME, event.processedTranscriptKey, mergedSegments)
  return null
}) as unknown as ((event: TranscriptEvent) => Promise<null>) 
