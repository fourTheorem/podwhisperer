import { basename, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import ReadableStream from 'readable-stream'

import { Context } from 'aws-lambda'
import { Upload } from '@aws-sdk/lib-storage'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { logger, middify } from '../lib/lambda-common'
import { transcodeAudio } from './transcode'
import envs from '../lib/envs'

const { BUCKET_NAME } = envs

type TranscodeEvent = {
  audioInputKey: string,
  audioOutputKey: string,
}

const s3Client = new S3Client({})

/**
 * Lambda function handler to transcode an audio file on S3 to MP3 format
 */
export const handleEvent = middify(async (event: TranscodeEvent, context: Context  ) => {
  logger.info('Transcoding audio', { event, BUCKET_NAME })
  const transcriptResponse = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: event.audioInputKey
  }))

  logger.info('Transcript response', { transcriptResponse })
  const requestId = context.awsRequestId
  const tempInputFilePath = resolve(tmpdir(), `${requestId}_${basename(event.audioInputKey)}`)
  const tempOutputFilePath = resolve(tmpdir(), `${requestId}_${basename(event.audioOutputKey)}`)

  logger.info('Using temporary files', { tempInputFilePath, tempOutputFilePath })
  try {
    await pipeline(
      transcriptResponse.Body as unknown as ReadableStream,
      createWriteStream(tempInputFilePath)
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
    } /* c8 ignore next 3 */ catch (err) {
      logger.warn('Failed to delete temporary files', { err })
    }
  }
}) as unknown as ((event: TranscodeEvent, context: Context) => Promise<null>) 
