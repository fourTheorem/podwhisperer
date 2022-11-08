import { basename } from 'node:path'
import { Context } from "aws-lambda"
import { logger, middify } from "../lib/lambda-common"

export type S3KeysEvent = {
  audioInputKey: string
}

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event: S3KeysEvent, context: Context) => {
  logger.info('Defining S3 Keys', { event })
  const base = basename(event.audioInputKey)
  const stem = base.split('.')[0]
  const keys = {
    mp3Key: `/audio/${stem}.mp3`,
    whisperOutputKey: `whisper-batch-output/${stem}.json`,
    transcribeOutputKey: `transcribe-output/${stem}`,
    processedTranscriptKey: `processed-transcripts/${stem}.json`,
  }
  logger.info('Keys', { keys })
  return keys
}) as unknown as ((event: S3KeysEvent) => Promise<null>) 
