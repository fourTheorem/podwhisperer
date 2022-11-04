import { basename, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import ReadableStream from 'readable-stream'

import { Upload } from '@aws-sdk/lib-storage'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { logger, middify } from '../lib/lambda-common.js'
import { transcodeAudio } from './transcode.js'

const { BUCKET_NAME } = process.env
if (!BUCKET_NAME) {
  throw new Error('BUCKET_NAME must be set')
}

type TranscodeEvent = {
  audioInputKey: string,
  audioOutputKey: string,
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

  const tempInputFilePath = resolve(tmpdir(), basename(event.audioInputKey))
  const tempOutputFilePath = resolve(tmpdir(), basename(event.audioOutputKey))
  logger.info('Using temporary files', { tempInputFilePath, tempOutputFilePath })
  const fileStream = await open(tempInputFilePath)
  try {
    await pipeline(
      transcriptResponse.Body as unknown as ReadableStream,
      fileStream.createWriteStream()
    )

    logger.info('Transcoding')
    await transcodeAudio({
      inputFilePath: tempInputFilePath,
      outputFilePath: tempOutputFilePath,
    })

    logger.info('Uploading')
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME, 
        Key: event.audioOutputKey,
        Body: (await open(tempOutputFilePath)).createReadStream()
      }
    })
    await upload.done()
    logger.info('Upload complete')
  } finally {
    try {
      unlink(tempInputFilePath)
      unlink(tempOutputFilePath)
    } catch (err) {
      logger.warn('Failed to delete temporary files', { err })
    }
  }
}) as unknown as ((event: TranscodeEvent) => Promise<null>) 
