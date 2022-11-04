import { logger, middify } from '../lib/lambda-common.js'
import ReadableStream from 'readable-stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { pipeline } from 'node:stream/promises'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'

const { BUCKET_NAME } = process.env
if (!BUCKET_NAME) {
  throw new Error('BUCKET_NAME must be set')
}

type TranscodeEvent = {
  audioInputKey: string,
  audioOutputputKey: string,
}

const s3Client = new S3Client({})

/**
 * @param {Object} event - Input event to the Lambda function
 *
 * @returns {Object} object - Object containing details of the stock buying transaction
 */
export const handleEvent = middify(async (event: TranscodeEvent) => {
  logger.info('Transcoding audio', { event })
  const transcriptResponse = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: event.audioInputKey
  }))

  const tempFilePath = resolve(tmpdir(), basename(event.audioInputKey))
  logger.info('Using temporary file', tempFilePath)
  const fileStream = await open(tempFilePath)
  try {
    await pipeline(
      transcriptResponse.Body as unknown as ReadableStream,
      fileStream.createWriteStream()
    )
  } finally {
    try {
      unlink(tempFilePath)
    } catch (err) {
      logger.warn('Failed to delete temporary file', {err, tempFilePath })
    }

  }
}) as unknown as ((event: TranscodeEvent) => Promise<null>) 
