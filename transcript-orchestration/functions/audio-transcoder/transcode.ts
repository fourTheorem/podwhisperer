import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { logger, metrics } from '../lib/lambda-common.js'
import FeedParser from 'feedparser'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { request } from 'undici'
import { MetricUnits} from '@aws-lambda-powertools/metrics'
import ffmpeg from 'ffmpeg'

export type AudioTranscodeOptions = {
  inputFilePath: string,
  outputFilePath: string
}

const s3Client = new S3Client({})

/**
 * Transcode an audio file
 *
 * @param options Options required to perform the transcode
 *
 * @returns Result
 */
export const transcodeAudio = async (options: AudioTranscodeOptions) : Promise<void> => {
  logger.info('Transcoding audio', options)
  const process = await new ffmpeg(options.inputFilePath)
  await process.save(options.outputFilePath)
  logger.info('Transcoding complete', options)
}
