import { basename } from 'node:path'
import { Context } from "aws-lambda"
import { logger, middify } from "../lib/lambda-common"

const WHISPER_OUTPUT_PREFIX = 'whisper-batch-output' // Prefix for all outputs from Whisper SageMaker Transform jobs

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
  const { audioInputKey } = event
  const base = basename(audioInputKey)
  const stem = base.split('.')[0]
  const keys = {
    mp3Key: `/audio/${stem}.mp3`,
    whisperOutputKey: `${WHISPER_OUTPUT_PREFIX}/${stem}.json`,
    whisperPrefix: WHISPER_OUTPUT_PREFIX,
    transcribeOutputKey: `transcribe-output/${stem}`,
    processedTranscriptKey: `processed-transcripts/${stem}.json`,
  }
  logger.info('Keys', { keys })
  return keys
}) as unknown as ((event: S3KeysEvent) => Promise<null>) 
