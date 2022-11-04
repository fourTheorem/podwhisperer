import { logger, middify } from '../lib/lambda-common.js'
import ReadableStream from 'readable-stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const { BUCKET_NAME } = process.env
if (!BUCKET_NAME) {
  throw new Error('BUCKET_NAME must be set')
}

type TranscriptEvent = {
  episodeNumber: number,
  whisperTranscriptKey: string
}



const s3Client = new S3Client({})

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event: TranscriptEvent) => {
  logger.info('Fetching whisper transcript', { event })
  const transcriptResponse = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: event.whisperTranscriptKey
  }))

  const chunks = []
  for await (const chunk of transcriptResponse.Body as any as ReadableStream) {
    chunks.push(chunk)
  }

  logger.info('Parsing transcript')
  const whisperTranscript = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  const segments = whisperTranscript.result.segments as TranscriptSegment[]

  logger.info('Transcript processed', { segments })
  return segments
}) as unknown as ((event: TranscriptEvent) => Promise<TranscriptSegment>) 
